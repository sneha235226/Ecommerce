const ReservedStock = require("../models/ReservedStock");

const RESERVATION_TTL_MINUTES = 15;

/**
 * Returns total quantity reserved by OTHER users for a variant.
 * Only counts non-expired reservations.
 */
async function getReservedByOthers(productId, variantId, excludeUserId) {
    const result = await ReservedStock.aggregate([
        {
            $match: {
                product:   productId,
                variantId: variantId,
                user:      { $ne: excludeUserId },
                expiresAt: { $gt: new Date() }
            }
        },
        { $group: { _id: null, total: { $sum: "$quantity" } } }
    ]);
    return result[0]?.total || 0;
}

/**
 * Returns effective available stock for a variant:
 *   availableStock = variant.stock - sum(reservedByOthers)
 *
 * Pass excludeUserId so the user's OWN existing reservation isn't counted
 * against them on re-checkout.
 */
async function getAvailableStock(productId, variantId, actualStock, excludeUserId = null) {
    const reservedByOthers = excludeUserId
        ? await getReservedByOthers(productId, variantId, excludeUserId)
        : 0;
    return Math.max(0, actualStock - reservedByOthers);
}

/**
 * Create or refresh a single reservation for one (user, product, variant).
 * Upsert so re-checking out overwrites the previous TTL.
 */
async function reserveItem(userId, productId, variantId, quantity, razorpayOrderId = "") {
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
    return ReservedStock.findOneAndUpdate(
        { user: userId, product: productId, variantId },
        { $set: { quantity, expiresAt, razorpayOrderId } },   // explicit $set — never replaces user/product/variantId
        { upsert: true, new: true }
    );
}

/**
 * Reserve all items for a cart checkout.
 *
 * For each item:
 *   1. Calculates available stock (subtracting other users' live reservations)
 *   2. Creates/refreshes reservation
 *
 * If any item fails availability, rolls back all reservations created so far.
 * This is an ADVISORY check — the atomic decrement at verify time is the
 * final guard against overselling.
 */
async function reserveCartItems(userId, orderItems, razorpayOrderId = "") {
    const createdIds = [];
    try {
        for (const row of orderItems) {
            const { item, variant } = row;
            const available = await getAvailableStock(item.product, item.variantId, variant.stock, userId);
            if (item.quantity > available) {
                throw {
                    status: 400,
                    message: `Insufficient stock for "${item.titleSnapshot}". Only ${available} left.`
                };
            }
            const reservation = await reserveItem(
                userId, item.product, item.variantId, item.quantity, razorpayOrderId
            );
            createdIds.push(reservation._id);
        }
    } catch (err) {
        // Rollback any reservations we just created
        if (createdIds.length) {
            await ReservedStock.deleteMany({ _id: { $in: createdIds } }).catch(() => {});
        }
        throw err;
    }
}

/**
 * Reserve a single item for Buy Now checkout.
 * Returns true if reservation succeeded, false if stock unavailable.
 */
async function reserveSingleItem(userId, productId, variantId, quantity, actualStock, razorpayOrderId = "") {
    const available = await getAvailableStock(productId, variantId, actualStock, userId);
    if (quantity > available) return false;
    await reserveItem(userId, productId, variantId, quantity, razorpayOrderId);
    return true;
}

/**
 * Check that a reservation exists and is still valid (not expired).
 * Returns the reservation doc or null.
 */
async function getValidReservation(userId, productId, variantId) {
    return ReservedStock.findOne({
        user:      userId,
        product:   productId,
        variantId: variantId,
        expiresAt: { $gt: new Date() }
    });
}

/**
 * Release ALL reservations for a user.
 * Called after order is placed (success) or user manually cancels.
 */
async function releaseUserReservations(userId) {
    await ReservedStock.deleteMany({ user: userId });
}

/**
 * Release reservations linked to a specific Razorpay order.
 * Called after successful payment processing or on failure.
 */
async function releaseByRazorpayOrder(razorpayOrderId) {
    await ReservedStock.deleteMany({ razorpayOrderId });
}

/**
 * Batch check available stock for multiple items in ONE aggregate query.
 * Returns a Map keyed by "productId_variantId" → available quantity.
 * Excludes `excludeUserId`'s own reservations so re-checkout works correctly.
 */
async function batchGetAvailableStock(resolvedItems, excludeUserId) {
    if (!resolvedItems.length) return new Map();

    const productIds  = resolvedItems.map(r => r.item.product);
    const variantIds  = resolvedItems.map(r => r.item.variantId);

    const rows = await ReservedStock.aggregate([
        {
            $match: {
                product:   { $in: productIds },
                variantId: { $in: variantIds },
                user:      { $ne: excludeUserId },
                expiresAt: { $gt: new Date() }
            }
        },
        {
            $group: {
                _id:      { product: "$product", variantId: "$variantId" },
                reserved: { $sum: "$quantity" }
            }
        }
    ]);

    const reservedMap = new Map(
        rows.map(r => [`${r._id.product}_${r._id.variantId}`, r.reserved])
    );

    // Use variant.stock from the first occurrence of each key.
    // Cart items for the same product+variant should be identical — take first.
    const result = new Map();
    for (const { item, variant } of resolvedItems) {
        const key = `${item.product}_${item.variantId}`;
        if (!result.has(key)) {
            const reserved = reservedMap.get(key) || 0;
            result.set(key, Math.max(0, variant.stock - reserved));
        }
    }
    return result;
}

module.exports = {
    getAvailableStock,
    batchGetAvailableStock,
    reserveCartItems,
    reserveSingleItem,
    reserveItem,
    getValidReservation,
    releaseUserReservations,
    releaseByRazorpayOrder,
    RESERVATION_TTL_MINUTES
};
