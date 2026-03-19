"use strict";

const crypto        = require("crypto");
const razorpay      = require("../../config/razorpay");
const Cart          = require("../../models/Cart");
const Order         = require("../../models/Order");
const Product       = require("../../models/Product");
const Seller        = require("../../models/Seller");
const AdminSettings  = require("../../models/AdminSettings");
const ReservedStock  = require("../../models/ReservedStock");
const { getBulkPrice, generateOrderNumber } = require("../../utils/orderUtils");
const {
    getAvailableStock,
    reserveCartItems,
    reserveSingleItem,
    getValidReservation,
    releaseUserReservations,
    releaseByRazorpayOrder,
    RESERVATION_TTL_MINUTES
} = require("../../services/stockReservationService");
const {
    resolveCartItems,
    verifyRazorpaySignature,
    findExpiredReservations,
    atomicDecrementAndCreateOrder,
    atomicDecrementSingleAndCreate
} = require("../../services/orderService");

const ONLINE_METHODS = ["upi", "card", "netbanking", "wallet"];
const VALID_METHODS  = [...ONLINE_METHODS, "cod"];
const MS_PER_DAY     = 86_400_000;

// ─── PURE HELPERS ────────────────────────────────────────────────────────────

function resolvePricingMode(sellerMode, appliedTier) {
    if (sellerMode === "hybrid") return appliedTier ? "wholesale" : "retail";
    return sellerMode;
}

function validateAddress(addr, label) {
    const required = ["fullName", "phone", "line1", "city", "state", "postalCode", "country"];
    for (const field of required) {
        if (!addr?.[field]?.toString().trim())
            return `${label}.${field} is required`;
    }
    return null;
}

// FIX #4: validate COD eligibility per product
function validateCodItems(resolvedItems) {
    for (const { item, product } of resolvedItems) {
        if (!product.allowCod)
            throw { status: 400, message: `"${item.titleSnapshot}" does not support Cash on Delivery` };
    }
}

// FIX #8: deduplicate clearCart logic
async function clearCart(cart) {
    cart.items          = [];
    cart.subtotal       = 0;
    cart.taxAmount      = 0;
    cart.shippingAmount = 0;
    cart.discountAmount = 0;
    cart.grandTotal     = 0;
    await cart.save();
}

// ─── DB HELPERS ──────────────────────────────────────────────────────────────

async function validateStockAvailability(resolvedItems, userId) {
    for (const { item, variant } of resolvedItems) {
        const available = await getAvailableStock(
            item.product, item.variantId, variant.stock, userId
        );
        if (item.quantity > available) {
            const msg = available > 0
                ? `Only ${available} left for "${item.titleSnapshot}"`
                : `"${item.titleSnapshot}" is out of stock`;
            throw { status: 400, message: msg };
        }
    }
}

async function computeCartTotals(resolvedItems, defaultCommission) {
    const uniqueSellerIds = [
        ...new Set(resolvedItems.map(r => r.item.seller).filter(Boolean).map(String))
    ];
    const sellerDocs = await Seller.find(
        { _id: { $in: uniqueSellerIds } },
        { commissionPercent: 1 }
    );
    const sellerMap = {};
    for (const s of sellerDocs) sellerMap[String(s._id)] = s.commissionPercent ?? defaultCommission;

    let subtotal = 0, taxAmount = 0;
    const orderItems = [];

    for (const { item, product, variant } of resolvedItems) {
        const pricing          = getBulkPrice(product, item.quantity, variant.price);
        const pricingMode      = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice        = pricing.price;
        const totalPrice       = parseFloat((unitPrice * item.quantity).toFixed(2));
        const commissionPct    = item.seller ? (sellerMap[String(item.seller)] ?? defaultCommission) : 0;
        const commissionAmount = parseFloat((totalPrice * commissionPct / 100).toFixed(2));
        const sellerPayoutAmt  = parseFloat((totalPrice - commissionAmount).toFixed(2));
        taxAmount += parseFloat((totalPrice * (product.taxRatePercent || 0) / 100).toFixed(2));
        subtotal  += totalPrice;

        orderItems.push({
            item, product, variant,
            unitPrice, totalPrice, pricingMode,
            appliedTier:        pricing.appliedTier,
            commissionPercent:  commissionPct,
            commissionAmount,
            sellerPayoutAmount: sellerPayoutAmt
        });
    }

    return {
        orderItems,
        subtotal:  parseFloat(subtotal.toFixed(2)),
        taxAmount: parseFloat(taxAmount.toFixed(2))
    };
}

function buildOrderItems(orderItems, holdUntilDate) {
    let hasWholesale = false;
    const items = orderItems.map(row => {
        if (row.pricingMode === "wholesale") hasWholesale = true;
        return {
            product:            row.item.product,
            store:              row.item.store,
            seller:             row.item.seller,
            variantId:          row.item.variantId,
            quantity:           row.item.quantity,
            unitPrice:          row.unitPrice,
            totalPrice:         row.totalPrice,
            pricingMode:        row.pricingMode,
            appliedTier:        row.appliedTier,
            commissionPercent:  row.commissionPercent,
            commissionAmount:   row.commissionAmount,
            sellerPayoutAmount: row.sellerPayoutAmount,
            payoutStatus:       "on_hold",
            holdUntil:          holdUntilDate,
            titleSnapshot:      row.item.titleSnapshot,
            skuSnapshot:        row.item.skuSnapshot,
            imageSnapshot:      row.item.imageSnapshot
        };
    });
    return { items, hasWholesale };
}

// FIX #9: refund with simple retry (up to 2 attempts, 1.5 s apart)
async function initiateRefund(razorpayPaymentId, amountPaise, reason, attempt = 1) {
    try {
        await razorpay.payments.refund(razorpayPaymentId, {
            amount: amountPaise,
            notes:  { reason }
        });
        console.log(`[Refund] ₹${amountPaise / 100} initiated for payment ${razorpayPaymentId}`);
    } catch (err) {
        console.error(`[Refund] attempt ${attempt} FAILED for ${razorpayPaymentId}:`, err.message);
        if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1500));
            return initiateRefund(razorpayPaymentId, amountPaise, reason, attempt + 1);
        }
        console.error(`[Refund] GIVING UP for ${razorpayPaymentId} — manual action required`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CART CHECKOUT
// POST /api/users/payments/cart/checkout
//
// COD    → validate → atomic decrement + create order (transaction)
// Online → validate → Razorpay order → reserve stock → return keys
// ─────────────────────────────────────────────────────────────────────────────
async function cartCheckout(req, res) {
    try {
        const {
            shippingAddress, billingAddress,
            paymentMethod,   shippingAmount: reqShipping
        } = req.body;

        const addrError = validateAddress(shippingAddress, "shippingAddress")
                       || validateAddress(billingAddress,  "billingAddress");
        if (addrError)      return res.status(400).json({ message: addrError });
        if (!paymentMethod) return res.status(400).json({ message: "paymentMethod is required" });
        if (!VALID_METHODS.includes(paymentMethod))
            return res.status(400).json({ message: `Invalid paymentMethod. Accepted: ${VALID_METHODS.join(", ")}` });

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart || cart.items.length === 0)
            return res.status(400).json({ message: "Cart is empty" });

        const settings      = await AdminSettings.getSettings();
        // FIX #1: resolveCartItems now batches all product fetches into ONE query
        const resolvedItems = await resolveCartItems(cart);

        await validateStockAvailability(resolvedItems, req.user._id);

        const { orderItems, subtotal, taxAmount } = await computeCartTotals(
            resolvedItems, settings.defaultCommissionPercent ?? 10
        );
        const shippingAmount = parseFloat((reqShipping || 0).toFixed(2));
        const grandTotal     = parseFloat((subtotal + taxAmount + shippingAmount).toFixed(2));

        // ── Online ─────────────────────────────────────────────────────────
        if (ONLINE_METHODS.includes(paymentMethod)) {
            const rzpOrder = await razorpay.orders.create({
                amount:   Math.round(grandTotal * 100),
                currency: "INR",
                receipt:  `cart_${req.user._id}_${Date.now()}`,
                notes:    { userId: String(req.user._id), type: "cart" }
            });

            try {
                await reserveCartItems(req.user._id, orderItems, rzpOrder.id);
            } catch (reserveErr) {
                if (reserveErr.status) throw reserveErr;
                console.error("[Reservation] non-critical failure:", reserveErr.message);
            }

            return res.status(201).json({
                type:            "online",
                razorpayOrderId: rzpOrder.id,
                amount:          grandTotal,
                currency:        "INR",
                key:             process.env.RAZORPAY_KEY_ID,
                reservedFor:     `${RESERVATION_TTL_MINUTES} minutes`
            });
        }

        // ── COD ────────────────────────────────────────────────────────────
        validateCodItems(resolvedItems);  // FIX #4

        const holdUntil = new Date(Date.now() + (settings.returnWindowDays || 7) * MS_PER_DAY);
        const { items: finalItems, hasWholesale } = buildOrderItems(orderItems, holdUntil);

        // FIX #2: atomic transaction — no manual rollback needed
        const order = await atomicDecrementAndCreateOrder(orderItems, {
            user:          req.user._id,
            orderType:     hasWholesale ? "B2B" : "B2C",
            orderNumber:   generateOrderNumber(),
            items:         finalItems,
            shippingAddress, billingAddress, paymentMethod,
            paymentStatus: "pending",
            subtotal, taxAmount, shippingAmount, grandTotal
        });

        await clearCart(cart);  // FIX #8
        return res.status(201).json({ type: "cod", message: "Order placed successfully", order });

    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: "Checkout failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CART VERIFY  (online only)
// POST /api/users/payments/cart/verify
// ─────────────────────────────────────────────────────────────────────────────
async function verifyAndPlaceCartOrder(req, res) {
    try {
        const {
            razorpayOrderId, razorpayPaymentId, razorpaySignature,
            shippingAddress, billingAddress,
            paymentMethod,   shippingAmount: reqShipping
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
            return res.status(400).json({
                message: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required"
            });

        // 1. Verify signature  (FIX #6: shared helper, not duplicated)
        if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature))
            return res.status(400).json({ message: "Payment verification failed: invalid signature" });

        const addrError = validateAddress(shippingAddress, "shippingAddress")
                       || validateAddress(billingAddress,  "billingAddress");
        if (addrError) return res.status(400).json({ message: addrError });

        // FIX #7: validate paymentMethod at verify time too
        if (!paymentMethod || !ONLINE_METHODS.includes(paymentMethod))
            return res.status(400).json({ message: "Invalid payment method" });

        // 2. Idempotency — return existing order if already placed
        const existingOrder = await Order.findOne({ razorpayOrderId });
        if (existingOrder)
            return res.status(200).json({ message: "Order already placed", order: existingOrder });

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart || cart.items.length === 0)
            return res.status(400).json({ message: "Cart is empty" });

        // 3. Resolve cart items (FIX #1: batch query)
        const resolvedItems = await resolveCartItems(cart);

        // 4. Check reservations (FIX #5: single batch query instead of N queries)
        const expiredItems = await findExpiredReservations(req.user._id, resolvedItems);
        if (expiredItems.length > 0) {
            return res.status(409).json({
                message: `Reservation expired for: ${expiredItems.join(", ")}. Please start checkout again.`,
                expired: true
            });
        }

        const settings = await AdminSettings.getSettings();
        const { orderItems, subtotal, taxAmount } = await computeCartTotals(
            resolvedItems, settings.defaultCommissionPercent ?? 10
        );
        const shippingAmount = parseFloat((reqShipping || 0).toFixed(2));
        const grandTotal     = parseFloat((subtotal + taxAmount + shippingAmount).toFixed(2));
        const holdUntil      = new Date(Date.now() + (settings.returnWindowDays || 7) * MS_PER_DAY);
        const { items: finalItems, hasWholesale } = buildOrderItems(orderItems, holdUntil);

        // 5. FIX #2: atomic transaction — decrement stock + create order
        let order;
        try {
            order = await atomicDecrementAndCreateOrder(orderItems, {
                user:               req.user._id,
                orderType:          hasWholesale ? "B2B" : "B2C",
                orderNumber:        generateOrderNumber(),
                items:              finalItems,
                shippingAddress, billingAddress, paymentMethod,
                paymentStatus:      "paid",
                razorpayOrderId, razorpayPaymentId, razorpaySignature,
                subtotal, taxAmount, shippingAmount, grandTotal,
                paidAt: new Date()
            });
        } catch (txErr) {
            if (txErr.stockError) {
                // Payment collected but stock gone → auto-refund (FIX #9: with retry)
                await initiateRefund(
                    razorpayPaymentId,
                    Math.round(grandTotal * 100),
                    "Stock unavailable at time of payment confirmation"
                );
                await releaseByRazorpayOrder(razorpayOrderId).catch(() => {});
                return res.status(409).json({
                    message:         txErr.message || "Stock unavailable. Your payment will be refunded.",
                    refundInitiated: true
                });
            }
            // E11000 on razorpayOrderId — duplicate concurrent verify call
            if (txErr.code === 11000 && txErr.keyPattern?.razorpayOrderId) {
                const dupOrder = await Order.findOne({ razorpayOrderId });
                if (dupOrder)
                    return res.status(200).json({ message: "Order already placed", order: dupOrder });
            }
            await initiateRefund(
                razorpayPaymentId,
                Math.round(grandTotal * 100),
                "Order creation failed after payment"
            );
            throw txErr;
        }

        // 6. Release reservations + clear cart
        await releaseByRazorpayOrder(razorpayOrderId).catch(() => {});
        await clearCart(cart);  // FIX #8

        return res.status(201).json({ message: "Order placed successfully", order });

    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: "Order placement failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY NOW
// POST /api/users/payments/buy-now
// ─────────────────────────────────────────────────────────────────────────────
async function buyNow(req, res) {
    try {
        const {
            productId, variantId, quantity,
            shippingAddress, billingAddress, paymentMethod
        } = req.body;

        if (!productId || !variantId)
            return res.status(400).json({ message: "productId and variantId are required" });

        const addrError = validateAddress(shippingAddress, "shippingAddress")
                       || validateAddress(billingAddress,  "billingAddress");
        if (addrError)      return res.status(400).json({ message: addrError });
        if (!paymentMethod) return res.status(400).json({ message: "paymentMethod is required" });
        if (!VALID_METHODS.includes(paymentMethod))
            return res.status(400).json({ message: `Invalid paymentMethod. Accepted: ${VALID_METHODS.join(", ")}` });

        const product = await Product.findById(productId);
        if (!product || !product.isActive)
            return res.status(404).json({ message: "Product not found" });

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive)
            return res.status(404).json({ message: "Variant not found" });

        const finalQty = Math.max(1, parseInt(quantity) || 1);

        const [sellerDoc, settings] = await Promise.all([
            product.seller
                ? Seller.findById(product.seller).select("commissionPercent")
                : Promise.resolve(null),
            AdminSettings.getSettings()
        ]);

        if (product.sellerMode === "wholesale") {
            if (!settings.wholesaleEnabled)
                return res.status(403).json({ message: "Wholesale products are currently unavailable" });
            if (finalQty < product.moq)
                return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });
        }

        const available = await getAvailableStock(
            product._id, variantId, variant.stock, req.user._id
        );
        if (finalQty > available) {
            const msg = available > 0 ? `Only ${available} left` : "Out of stock";
            return res.status(400).json({ message: msg });
        }

        const defaultCommission = settings.defaultCommissionPercent ?? 10;
        const commissionPercent = sellerDoc?.commissionPercent ?? defaultCommission;
        const pricing           = getBulkPrice(product, finalQty, variant.price);
        const pricingMode       = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice         = pricing.price;
        const totalPrice        = parseFloat((unitPrice * finalQty).toFixed(2));
        const commissionAmount  = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
        const sellerPayoutAmt   = parseFloat((totalPrice - commissionAmount).toFixed(2));
        const taxAmount         = parseFloat((totalPrice * (product.taxRatePercent || 0) / 100).toFixed(2));
        const grandTotal        = parseFloat((totalPrice + taxAmount).toFixed(2));
        const holdUntil         = new Date(Date.now() + (settings.returnWindowDays || 7) * MS_PER_DAY);

        const itemPayload = {
            product:            product._id,
            store:              product.store,
            seller:             product.seller,
            variantId,
            quantity:           finalQty,
            unitPrice,          totalPrice,   pricingMode,
            appliedTier:        pricing.appliedTier,
            commissionPercent,  commissionAmount,
            sellerPayoutAmount: sellerPayoutAmt,
            payoutStatus:       "on_hold",
            holdUntil,
            titleSnapshot:      product.title,
            skuSnapshot:        variant.sku,
            imageSnapshot:      variant.images?.[0] || product.images?.[0] || ""
        };

        // ── Online ─────────────────────────────────────────────────────────
        if (ONLINE_METHODS.includes(paymentMethod)) {
            const rzpOrder = await razorpay.orders.create({
                amount:   Math.round(grandTotal * 100),
                currency: "INR",
                receipt:  `buynow_${req.user._id}_${Date.now()}`,
                notes:    { userId: String(req.user._id), productId: String(productId), type: "buynow" }
            });

            // FIX #3: check return value — false means stock was grabbed between check and reserve
            const reserved = await reserveSingleItem(
                req.user._id, product._id, variantId, finalQty, variant.stock, rzpOrder.id
            );
            if (!reserved) {
                return res.status(400).json({
                    message: "Stock just became unavailable. Please refresh and try again."
                });
            }

            return res.status(201).json({
                type:            "online",
                razorpayOrderId: rzpOrder.id,
                amount:          grandTotal,
                currency:        "INR",
                key:             process.env.RAZORPAY_KEY_ID,
                reservedFor:     `${RESERVATION_TTL_MINUTES} minutes`
            });
        }

        // ── COD ────────────────────────────────────────────────────────────
        if (!product.allowCod)  // FIX #4
            return res.status(400).json({ message: "This product does not support Cash on Delivery" });

        // FIX #2: atomic transaction
        const order = await atomicDecrementSingleAndCreate(
            product._id, variantId, finalQty, product.title, {
                user:          req.user._id,
                orderType:     pricingMode === "wholesale" ? "B2B" : "B2C",
                orderNumber:   generateOrderNumber(),
                items:         [itemPayload],
                shippingAddress, billingAddress, paymentMethod,
                paymentStatus: "pending",
                subtotal: totalPrice, taxAmount, shippingAmount: 0, grandTotal
            }
        );

        return res.status(201).json({ type: "cod", message: "Order placed successfully", order });

    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: "Order placement failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY NOW VERIFY  (online only)
// POST /api/users/payments/buy-now/verify
// ─────────────────────────────────────────────────────────────────────────────
async function verifyAndPlaceBuyNow(req, res) {
    try {
        const {
            razorpayOrderId, razorpayPaymentId, razorpaySignature,
            productId, variantId, quantity,
            shippingAddress, billingAddress, paymentMethod
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
            return res.status(400).json({
                message: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required"
            });

        // 1. Verify signature (FIX #6: shared helper)
        if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature))
            return res.status(400).json({ message: "Payment verification failed: invalid signature" });

        const addrError = validateAddress(shippingAddress, "shippingAddress")
                       || validateAddress(billingAddress,  "billingAddress");
        if (addrError) return res.status(400).json({ message: addrError });

        // FIX #7: validate paymentMethod at verify time
        if (!paymentMethod || !ONLINE_METHODS.includes(paymentMethod))
            return res.status(400).json({ message: "Invalid payment method" });

        // 2. Idempotency
        const existingOrder = await Order.findOne({ razorpayOrderId });
        if (existingOrder)
            return res.status(200).json({ message: "Order already placed", order: existingOrder });

        const product = await Product.findById(productId);
        if (!product || !product.isActive)
            return res.status(404).json({ message: "Product not found" });

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive)
            return res.status(404).json({ message: "Variant not found" });

        const finalQty = Math.max(1, parseInt(quantity) || 1);

        // 3. Check reservation is still valid
        const reservation = await getValidReservation(req.user._id, product._id, variantId);
        if (!reservation) {
            return res.status(409).json({
                message: "Your reservation has expired. Please start checkout again.",
                expired: true
            });
        }

        const [sellerDoc, settings] = await Promise.all([
            product.seller
                ? Seller.findById(product.seller).select("commissionPercent")
                : Promise.resolve(null),
            AdminSettings.getSettings()
        ]);

        if (product.sellerMode === "wholesale" && finalQty < product.moq)
            return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });

        const defaultCommission = settings.defaultCommissionPercent ?? 10;
        const commissionPercent = sellerDoc?.commissionPercent ?? defaultCommission;
        const pricing           = getBulkPrice(product, finalQty, variant.price);
        const pricingMode       = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice         = pricing.price;
        const totalPrice        = parseFloat((unitPrice * finalQty).toFixed(2));
        const commissionAmount  = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
        const sellerPayoutAmt   = parseFloat((totalPrice - commissionAmount).toFixed(2));
        const taxAmount         = parseFloat((totalPrice * (product.taxRatePercent || 0) / 100).toFixed(2));
        const grandTotal        = parseFloat((totalPrice + taxAmount).toFixed(2));
        const holdUntil         = new Date(Date.now() + (settings.returnWindowDays || 7) * MS_PER_DAY);

        // 4. FIX #2: atomic transaction
        let order;
        try {
            order = await atomicDecrementSingleAndCreate(
                product._id, variantId, finalQty, product.title, {
                    user:        req.user._id,
                    orderType:   pricingMode === "wholesale" ? "B2B" : "B2C",
                    orderNumber: generateOrderNumber(),
                    items: [{
                        product:            product._id,
                        store:              product.store,
                        seller:             product.seller,
                        variantId,
                        quantity:           finalQty,
                        unitPrice,          totalPrice,   pricingMode,
                        appliedTier:        pricing.appliedTier,
                        commissionPercent,  commissionAmount,
                        sellerPayoutAmount: sellerPayoutAmt,
                        payoutStatus:       "on_hold",
                        holdUntil,
                        titleSnapshot:      product.title,
                        skuSnapshot:        variant.sku,
                        imageSnapshot:      variant.images?.[0] || product.images?.[0] || ""
                    }],
                    shippingAddress, billingAddress, paymentMethod,
                    paymentStatus:     "paid",
                    razorpayOrderId, razorpayPaymentId, razorpaySignature,
                    subtotal: totalPrice, taxAmount, shippingAmount: 0, grandTotal,
                    paidAt: new Date()
                }
            );
        } catch (txErr) {
            if (txErr.stockError) {
                await initiateRefund(  // FIX #9: with retry
                    razorpayPaymentId,
                    Math.round(grandTotal * 100),
                    "Stock unavailable at time of payment confirmation"
                );
                await releaseByRazorpayOrder(razorpayOrderId).catch(() => {});
                return res.status(409).json({
                    message:         txErr.message || "Stock unavailable. Your payment will be refunded.",
                    refundInitiated: true
                });
            }
            if (txErr.code === 11000 && txErr.keyPattern?.razorpayOrderId) {
                const dupOrder = await Order.findOne({ razorpayOrderId });
                if (dupOrder)
                    return res.status(200).json({ message: "Order already placed", order: dupOrder });
            }
            await initiateRefund(
                razorpayPaymentId,
                Math.round(grandTotal * 100),
                "Order creation failed after payment"
            );
            throw txErr;
        }

        // 5. Release reservation
        await releaseByRazorpayOrder(razorpayOrderId).catch(() => {});

        return res.status(201).json({ message: "Order placed successfully", order });

    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: "Order placement failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RELEASE RESERVATION
// DELETE /api/users/payments/reservation
//
// FIX #10: accepts optional razorpayOrderId to release only that session —
// prevents cancelling a concurrent checkout in another browser tab.
// ─────────────────────────────────────────────────────────────────────────────
async function releaseReservation(req, res) {
    try {
        const { razorpayOrderId } = req.body;

        if (razorpayOrderId) {
            // Filter by both razorpayOrderId AND user — prevents releasing another user's reservation
            await ReservedStock.deleteMany({ razorpayOrderId, user: req.user._id });
        } else {
            await releaseUserReservations(req.user._id);
        }
        return res.status(200).json({ message: "Reservation released" });
    } catch (error) {
        return res.status(500).json({ message: "Failed to release reservation", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY WEBHOOK
// POST /api/users/payments/webhook/razorpay
// ─────────────────────────────────────────────────────────────────────────────
async function razorpayWebhook(req, res) {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.warn("[Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature verification");
        } else {
            const signature = req.headers["x-razorpay-signature"];
            const rawBody   = req.rawBody || Buffer.from(JSON.stringify(req.body));
            const expected  = crypto
                .createHmac("sha256", webhookSecret)
                .update(rawBody)
                .digest("hex");
            if (signature !== expected)
                return res.status(400).json({ message: "Invalid webhook signature" });
        }

        const event   = req.body.event;
        const payload = req.body.payload?.payment?.entity;
        if (!payload) return res.status(200).json({ received: true });

        const razorpayPaymentId = payload.id;
        const razorpayOrderId   = payload.order_id;

        if (event === "payment.captured") {
            const existing = await Order.findOne({ razorpayOrderId });
            if (existing) {
                if (existing.paymentStatus !== "paid") {
                    existing.paymentStatus     = "paid";
                    existing.razorpayPaymentId = razorpayPaymentId;
                    existing.paidAt            = new Date();
                    await existing.save();
                }
                return res.status(200).json({ received: true, status: "already_processed" });
            }
            console.warn(
                `[Webhook] payment.captured for ${razorpayOrderId} — no order found. ` +
                `paymentId=${razorpayPaymentId}. Manual reconciliation required.`
            );
        }

        if (event === "payment.failed") {
            if (razorpayOrderId)
                await releaseByRazorpayOrder(razorpayOrderId).catch(() => {});
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error("[Webhook] error:", error.message);
        return res.status(500).json({ message: "Webhook processing failed" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RETURN REQUEST
// POST /api/users/payments/orders/:orderId/items/:itemId/return
// ─────────────────────────────────────────────────────────────────────────────
async function requestReturn(req, res) {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;

        const order = await Order.findOne({ _id: orderId, user: req.user._id });
        if (!order) return res.status(404).json({ message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item)  return res.status(404).json({ message: "Order item not found" });

        if (item.status !== "delivered")
            return res.status(400).json({ message: "Return can only be requested for delivered items" });

        if (item.returnStatus !== "none")
            return res.status(400).json({ message: `Return already ${item.returnStatus}` });

        if (item.holdUntil && new Date() > item.holdUntil)
            return res.status(400).json({ message: "Return window has expired" });

        item.returnStatus      = "requested";
        item.returnReason      = reason || "";
        item.returnRequestedAt = new Date();
        await order.save();

        return res.json({
            message:      "Return requested successfully",
            itemId,
            returnStatus: item.returnStatus
        });
    } catch (error) {
        return res.status(500).json({ message: "Return request failed", error: error.message });
    }
}

module.exports = {
    cartCheckout,
    verifyAndPlaceCartOrder,
    buyNow,
    verifyAndPlaceBuyNow,
    releaseReservation,
    razorpayWebhook,
    requestReturn
};
