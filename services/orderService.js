/**
 * orderService.js
 *
 * Shared business logic for order placement:
 *  - Batch product resolution (fixes N+1 query)
 *  - Razorpay signature verification (deduplicates repeated HMAC code)
 *  - Batch reservation check (fixes N per-item queries)
 *  - Atomic stock decrement + order creation via MongoDB transactions
 *    (eliminates manual rollback blocks that could silently fail)
 *
 * TRANSACTION NOTE:
 *   atomicDecrementAndCreateOrder / atomicDecrementSingleAndCreate require
 *   MongoDB to be running as a replica set (Atlas, or local rs).
 *   On a standalone dev instance they will throw — set MONGO_TRANSACTIONS=false
 *   in .env to fall back to the sequential-with-rollback path.
 */

"use strict";

const crypto   = require("crypto");
const mongoose = require("mongoose");
const Product  = require("../models/Product");
const Order    = require("../models/Order");
const ReservedStock = require("../models/ReservedStock");

const USE_TRANSACTIONS = process.env.MONGO_TRANSACTIONS !== "false";

// ─── FIX #1: batch product fetch (replaces N × findById in a loop) ──────────

/**
 * Fetch all products needed for cart items in ONE query.
 * @returns {Map<string, ProductDoc>}
 */
async function batchFetchProducts(cartItems) {
    const ids  = [...new Set(cartItems.map(i => i.product.toString()))];
    const docs = await Product.find({ _id: { $in: ids } });
    return new Map(docs.map(p => [p._id.toString(), p]));
}

/**
 * Resolve + validate all cart items against the live DB using a single query.
 * Validates: product active, variant active, wholesale MOQ.
 * Does NOT check stock — handled separately per flow.
 *
 * @returns {Array<{ item, product, variant }>}
 */
async function resolveCartItems(cart) {
    const productMap   = await batchFetchProducts(cart.items);
    const resolvedItems = [];

    for (const item of cart.items) {
        const product = productMap.get(item.product.toString());
        if (!product || !product.isActive)
            throw { status: 400, message: `Product "${item.titleSnapshot}" is no longer available` };

        const variant = product.variants.id(item.variantId);
        if (!variant || !variant.isActive)
            throw { status: 400, message: `Variant for "${item.titleSnapshot}" is no longer available` };

        if (product.sellerMode === "wholesale" && item.quantity < product.moq)
            throw { status: 400, message: `"${item.titleSnapshot}" requires a minimum quantity of ${product.moq}` };

        resolvedItems.push({ item, product, variant });
    }
    return resolvedItems;
}

// ─── FIX #6: deduplicate Razorpay signature logic ───────────────────────────

/**
 * Verify Razorpay payment signature.
 * @returns {boolean}
 */
function verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");
    return expected === razorpaySignature;
}

// ─── FIX #5: batch reservation check (replaces N × getValidReservation) ─────

/**
 * Return title snapshots for any items that have NO valid (non-expired) reservation.
 * Uses a single DB query for all items.
 *
 * @param {ObjectId} userId
 * @param {Array<{ item, product, variant }>} resolvedItems
 * @returns {string[]} Array of titleSnapshots that have expired / missing reservations
 */
async function findExpiredReservations(userId, resolvedItems) {
    const reservations = await ReservedStock.find({
        user:      userId,
        expiresAt: { $gt: new Date() }
    }).select("variantId").lean();

    const reservedVariantIds = new Set(reservations.map(r => r.variantId.toString()));

    return resolvedItems
        .filter(({ item }) => !reservedVariantIds.has(item.variantId.toString()))
        .map(({ item }) => item.titleSnapshot);
}

// ─── FIX #2: MongoDB transactions ───────────────────────────────────────────
// Replace manual rollback (which could silently fail) with true atomicity.

/**
 * Atomically decrement stock for MULTIPLE items and create an order.
 * If any stock decrement fails the entire transaction aborts — nothing is persisted.
 *
 * Falls back to sequential ops + manual rollback when MONGO_TRANSACTIONS=false.
 *
 * @param {Array} orderItems   — from computeCartTotals (each has .item.{product,variantId,quantity,titleSnapshot})
 * @param {object} orderData   — plain object passed to Order.create
 * @returns {Order}
 */
async function atomicDecrementAndCreateOrder(orderItems, orderData) {
    if (USE_TRANSACTIONS) {
        return _withTransactionMulti(orderItems, orderData);
    }
    return _sequentialMulti(orderItems, orderData);
}

/**
 * Atomically decrement stock for a SINGLE item and create an order (Buy Now).
 *
 * @param {ObjectId} productId
 * @param {ObjectId} variantId
 * @param {number}   qty
 * @param {string}   titleSnapshot  — used in error messages
 * @param {object}   orderData
 * @returns {Order}
 */
async function atomicDecrementSingleAndCreate(productId, variantId, qty, titleSnapshot, orderData) {
    if (USE_TRANSACTIONS) {
        return _withTransactionSingle(productId, variantId, qty, titleSnapshot, orderData);
    }
    return _sequentialSingle(productId, variantId, qty, titleSnapshot, orderData);
}

// ── transaction helpers ──────────────────────────────────────────────────────

async function _withTransactionMulti(orderItems, orderData) {
    const session = await mongoose.startSession();
    let order;
    try {
        await session.withTransaction(async () => {
            for (const row of orderItems) {
                const { item } = row;
                const result = await Product.updateOne(
                    {
                        _id:              item.product,
                        "variants._id":   item.variantId,
                        "variants.stock": { $gte: item.quantity }
                    },
                    { $inc: { "variants.$.stock": -item.quantity, totalStock: -item.quantity } },
                    { session }
                );
                if (result.modifiedCount === 0) {
                    const err = new Error(
                        `Stock no longer available for "${item.titleSnapshot}". Please try again.`
                    );
                    err.status    = 409;
                    err.stockError = true;
                    throw err;
                }
            }
            const [created] = await Order.create([orderData], { session });
            order = created;
        });
    } finally {
        await session.endSession();
    }
    return order;
}

async function _withTransactionSingle(productId, variantId, qty, titleSnapshot, orderData) {
    const session = await mongoose.startSession();
    let order;
    try {
        await session.withTransaction(async () => {
            const result = await Product.updateOne(
                {
                    _id:              productId,
                    "variants._id":   variantId,
                    "variants.stock": { $gte: qty }
                },
                { $inc: { "variants.$.stock": -qty, totalStock: -qty } },
                { session }
            );
            if (result.modifiedCount === 0) {
                const err = new Error(
                    `Stock no longer available for "${titleSnapshot}". Please try again.`
                );
                err.status    = 409;
                err.stockError = true;
                throw err;
            }
            const [created] = await Order.create([orderData], { session });
            order = created;
        });
    } finally {
        await session.endSession();
    }
    return order;
}

// ── fallback: sequential ops + manual rollback (standalone MongoDB) ──────────

async function _sequentialMulti(orderItems, orderData) {
    const decremented = [];
    for (const row of orderItems) {
        const { item } = row;
        const result = await Product.updateOne(
            {
                _id:              item.product,
                "variants._id":   item.variantId,
                "variants.stock": { $gte: item.quantity }
            },
            { $inc: { "variants.$.stock": -item.quantity, totalStock: -item.quantity } }
        );
        if (result.modifiedCount === 0) {
            // Rollback successful decrements before throwing
            for (const dec of decremented) {
                await Product.updateOne(
                    { _id: dec.productId, "variants._id": dec.variantId },
                    { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                ).catch(e => console.error("CRITICAL: stock rollback failed:", e.message));
            }
            const err = new Error(
                `Stock no longer available for "${item.titleSnapshot}". Please try again.`
            );
            err.status    = 409;
            err.stockError = true;
            throw err;
        }
        decremented.push({ productId: item.product, variantId: item.variantId, qty: item.quantity });
    }

    try {
        return await Order.create(orderData);
    } catch (err) {
        for (const dec of decremented) {
            await Product.updateOne(
                { _id: dec.productId, "variants._id": dec.variantId },
                { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
            ).catch(e => console.error("CRITICAL: stock rollback failed:", e.message));
        }
        throw err;
    }
}

async function _sequentialSingle(productId, variantId, qty, titleSnapshot, orderData) {
    const result = await Product.updateOne(
        {
            _id:              productId,
            "variants._id":   variantId,
            "variants.stock": { $gte: qty }
        },
        { $inc: { "variants.$.stock": -qty, totalStock: -qty } }
    );
    if (result.modifiedCount === 0) {
        const err = new Error(`Stock no longer available for "${titleSnapshot}". Please try again.`);
        err.status    = 409;
        err.stockError = true;
        throw err;
    }
    try {
        return await Order.create(orderData);
    } catch (err) {
        await Product.updateOne(
            { _id: productId, "variants._id": variantId },
            { $inc: { "variants.$.stock": qty, totalStock: qty } }
        ).catch(e => console.error("CRITICAL: single stock rollback failed:", e.message));
        throw err;
    }
}

module.exports = {
    resolveCartItems,
    verifyRazorpaySignature,
    findExpiredReservations,
    atomicDecrementAndCreateOrder,
    atomicDecrementSingleAndCreate
};
