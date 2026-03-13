const crypto = require("crypto");
const razorpay = require("../../config/razorpay");
const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const AdminSettings = require("../../models/AdminSettings");
const { getBulkPrice, generateOrderNumber } = require("../../utils/orderUtils");

const ONLINE_METHODS = ["upi", "card", "netbanking", "wallet"];

function resolvePricingMode(sellerMode, appliedTier) {
    if (sellerMode === "hybrid") return appliedTier ? "wholesale" : "retail";
    return sellerMode;
}

function validateAddress(addr, label) {
    const required = ["fullName", "phone", "line1", "city", "state", "postalCode", "country"];
    for (const field of required) {
        if (!addr?.[field]?.toString().trim()) return `${label}.${field} is required`;
    }
    return null;
}

// Validate and resolve all cart items against live DB state
async function buildCartItems(cart) {
    const resolvedItems = [];
    for (const item of cart.items) {
        const product = await Product.findById(item.product);
        if (!product || !product.isActive)
            throw { status: 400, message: `Product "${item.titleSnapshot}" is no longer available` };
        const variant = product.variants.id(item.variantId);
        if (!variant || !variant.isActive)
            throw { status: 400, message: `Variant for "${item.titleSnapshot}" is no longer available` };
        if (item.quantity > variant.stock)
            throw { status: 400, message: `Insufficient stock for "${item.titleSnapshot}". Only ${variant.stock} left.` };
        if (product.sellerMode === "wholesale" && item.quantity < product.moq)
            throw { status: 400, message: `"${item.titleSnapshot}" requires a minimum quantity of ${product.moq}` };
        resolvedItems.push({ item, product, variant });
    }
    return resolvedItems;
}

// Compute commissions + totals for all cart items
async function computeCartTotals(resolvedItems, defaultCommission) {
    const uniqueSellerIds = [...new Set(
        resolvedItems.map(r => r.item.seller).filter(Boolean).map(String)
    )];
    const sellerDocs = await Seller.find({ _id: { $in: uniqueSellerIds } }, { commissionPercent: 1 });
    const sellerMap = {};
    for (const s of sellerDocs) sellerMap[String(s._id)] = s.commissionPercent ?? defaultCommission;

    let subtotal = 0, taxAmount = 0;
    const orderItems = [];

    for (const { item, product, variant } of resolvedItems) {
        const pricing = getBulkPrice(product, item.quantity, variant.price);
        const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice = pricing.price;
        const totalPrice = parseFloat((unitPrice * item.quantity).toFixed(2));
        const commissionPercent = item.seller ? (sellerMap[String(item.seller)] ?? defaultCommission) : 0;
        const commissionAmount = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
        const sellerPayoutAmount = parseFloat((totalPrice - commissionAmount).toFixed(2));
        taxAmount += parseFloat((totalPrice * (product.taxRatePercent || 0) / 100).toFixed(2));
        subtotal += totalPrice;
        orderItems.push({
            item, product, variant, unitPrice, totalPrice, pricingMode,
            appliedTier: pricing.appliedTier, commissionPercent, commissionAmount, sellerPayoutAmount
        });
    }

    return {
        orderItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        taxAmount: parseFloat(taxAmount.toFixed(2))
    };
}

// Atomic stock decrement for multiple items — rolls back on any failure
async function decrementStockForItems(orderItems) {
    const stockDecrements = [];
    for (const row of orderItems) {
        const { item } = row;
        const stockResult = await Product.updateOne(
            { _id: item.product, "variants._id": item.variantId, "variants.stock": { $gte: item.quantity } },
            { $inc: { "variants.$.stock": -item.quantity, totalStock: -item.quantity } }
        );
        if (stockResult.modifiedCount === 0) {
            // Rollback all prior decrements
            for (const dec of stockDecrements) {
                await Product.updateOne(
                    { _id: dec.productId, "variants._id": dec.variantId },
                    { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                );
            }
            throw { status: 400, message: `Insufficient stock for "${item.titleSnapshot}". Please refresh your cart.` };
        }
        stockDecrements.push({ productId: item.product, variantId: item.variantId, qty: item.quantity });
    }
    return stockDecrements;
}

// ─────────────────────────────────────────────────────────────────────────────
// CART CHECKOUT  (unified — handles both COD and online)
// POST /api/users/payments/cart/checkout
// Body: { shippingAddress, billingAddress, paymentMethod, shippingAmount? }
//
// COD    → order created immediately  → { order }
// Online → Razorpay order created     → { razorpayOrderId, amount, currency, key }
// ─────────────────────────────────────────────────────────────────────────────
async function cartCheckout(req, res) {
    try {
        const { shippingAddress, billingAddress, paymentMethod, shippingAmount: reqShipping } = req.body;

        const addrError = validateAddress(shippingAddress, "shippingAddress") || validateAddress(billingAddress, "billingAddress");
        if (addrError) return res.status(400).json({ message: addrError });
        if (!paymentMethod) return res.status(400).json({ message: "paymentMethod is required" });

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart || cart.items.length === 0) return res.status(400).json({ message: "Cart is empty" });

        const settings = await AdminSettings.getSettings();
        const resolvedItems = await buildCartItems(cart);
        const { orderItems, subtotal, taxAmount } = await computeCartTotals(resolvedItems, settings.defaultCommissionPercent ?? 10);
        const shippingAmount = parseFloat((reqShipping || 0).toFixed(2));
        const grandTotal = parseFloat((subtotal + taxAmount + shippingAmount).toFixed(2));

        // ── Online payment: return Razorpay order details ──────────────────
        if (ONLINE_METHODS.includes(paymentMethod)) {
            const rzpOrder = await razorpay.orders.create({
                amount: Math.round(grandTotal * 100),
                currency: "INR",
                receipt: `cart_${req.user._id}_${Date.now()}`,
                notes: { userId: String(req.user._id) }
            });
            return res.status(201).json({
                type: "online",
                razorpayOrderId: rzpOrder.id,
                amount: grandTotal,
                currency: "INR",
                key: process.env.RAZORPAY_KEY_ID
            });
        }

        // ── COD: create order immediately ─────────────────────────────────
        const stockDecrements = await decrementStockForItems(orderItems);

        let hasWholesaleItem = false;
        const finalItems = orderItems.map(row => {
            if (row.pricingMode === "wholesale") hasWholesaleItem = true;
            return {
                product: row.item.product,
                store: row.item.store,
                seller: row.item.seller,
                variantId: row.item.variantId,
                quantity: row.item.quantity,
                unitPrice: row.unitPrice,
                totalPrice: row.totalPrice,
                pricingMode: row.pricingMode,
                appliedTier: row.appliedTier,
                commissionPercent: row.commissionPercent,
                commissionAmount: row.commissionAmount,
                sellerPayoutAmount: row.sellerPayoutAmount,
                payoutStatus: "on_hold",
                titleSnapshot: row.item.titleSnapshot,
                skuSnapshot: row.item.skuSnapshot,
                imageSnapshot: row.item.imageSnapshot
            };
        });

        let order;
        try {
            order = await Order.create({
                user: req.user._id,
                orderType: hasWholesaleItem ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: finalItems,
                shippingAddress, billingAddress, paymentMethod,
                paymentStatus: "pending",
                subtotal, taxAmount, shippingAmount, grandTotal
            });
        } catch (err) {
            for (const dec of stockDecrements) {
                await Product.updateOne(
                    { _id: dec.productId, "variants._id": dec.variantId },
                    { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                );
            }
            throw err;
        }

        cart.items = [];
        cart.subtotal = 0; cart.taxAmount = 0; cart.shippingAmount = 0;
        cart.discountAmount = 0; cart.grandTotal = 0;
        await cart.save();

        return res.status(201).json({ type: "cod", message: "Order placed successfully", order });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: "Checkout failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CART VERIFY  (online only — called after Razorpay checkout completes)
// POST /api/users/payments/cart/verify
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature,
//         shippingAddress, billingAddress, paymentMethod, shippingAmount? }
// ─────────────────────────────────────────────────────────────────────────────
async function verifyAndPlaceCartOrder(req, res) {
    try {
        const {
            razorpayOrderId, razorpayPaymentId, razorpaySignature,
            shippingAddress, billingAddress, paymentMethod, shippingAmount: reqShipping
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
            return res.status(400).json({ message: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required" });

        const expectedSig = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");
        if (expectedSig !== razorpaySignature)
            return res.status(400).json({ message: "Payment verification failed: invalid signature" });

        const addrError = validateAddress(shippingAddress, "shippingAddress") || validateAddress(billingAddress, "billingAddress");
        if (addrError) return res.status(400).json({ message: addrError });

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart || cart.items.length === 0) return res.status(400).json({ message: "Cart is empty" });

        const settings = await AdminSettings.getSettings();
        const resolvedItems = await buildCartItems(cart);
        const { orderItems, subtotal, taxAmount } = await computeCartTotals(resolvedItems, settings.defaultCommissionPercent ?? 10);
        const shippingAmount = parseFloat((reqShipping || 0).toFixed(2));
        const grandTotal = parseFloat((subtotal + taxAmount + shippingAmount).toFixed(2));

        const stockDecrements = await decrementStockForItems(orderItems);

        let hasWholesaleItem = false;
        const finalItems = orderItems.map(row => {
            if (row.pricingMode === "wholesale") hasWholesaleItem = true;
            return {
                product: row.item.product,
                store: row.item.store,
                seller: row.item.seller,
                variantId: row.item.variantId,
                quantity: row.item.quantity,
                unitPrice: row.unitPrice,
                totalPrice: row.totalPrice,
                pricingMode: row.pricingMode,
                appliedTier: row.appliedTier,
                commissionPercent: row.commissionPercent,
                commissionAmount: row.commissionAmount,
                sellerPayoutAmount: row.sellerPayoutAmount,
                payoutStatus: "on_hold",
                titleSnapshot: row.item.titleSnapshot,
                skuSnapshot: row.item.skuSnapshot,
                imageSnapshot: row.item.imageSnapshot
            };
        });

        let order;
        try {
            order = await Order.create({
                user: req.user._id,
                orderType: hasWholesaleItem ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: finalItems,
                shippingAddress, billingAddress, paymentMethod,
                paymentStatus: "paid",
                razorpayOrderId, razorpayPaymentId, razorpaySignature,
                subtotal, taxAmount, shippingAmount, grandTotal,
                paidAt: new Date()
            });
        } catch (err) {
            for (const dec of stockDecrements) {
                await Product.updateOne(
                    { _id: dec.productId, "variants._id": dec.variantId },
                    { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                );
            }
            throw err;
        }

        cart.items = [];
        cart.subtotal = 0; cart.taxAmount = 0; cart.shippingAmount = 0;
        cart.discountAmount = 0; cart.grandTotal = 0;
        await cart.save();

        return res.status(201).json({ message: "Order placed successfully", order });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: "Order placement failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY NOW  (unified — handles both COD and online)
// POST /api/users/payments/buy-now
// Body: { productId, variantId, quantity, shippingAddress, billingAddress, paymentMethod }
//
// COD    → order created immediately  → { order }
// Online → Razorpay order created     → { razorpayOrderId, amount, currency, key }
// ─────────────────────────────────────────────────────────────────────────────
async function buyNow(req, res) {
    try {
        const { productId, variantId, quantity, shippingAddress, billingAddress, paymentMethod } = req.body;

        if (!productId || !variantId) return res.status(400).json({ message: "productId and variantId are required" });

        const addrError = validateAddress(shippingAddress, "shippingAddress") || validateAddress(billingAddress, "billingAddress");
        if (addrError) return res.status(400).json({ message: addrError });
        if (!paymentMethod) return res.status(400).json({ message: "paymentMethod is required" });

        const product = await Product.findById(productId);
        if (!product || !product.isActive) return res.status(404).json({ message: "Product not found" });

        if (product.sellerMode === "wholesale") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled)
                return res.status(403).json({ message: "Wholesale products are currently unavailable" });
        }

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) return res.status(404).json({ message: "Variant not found" });

        const finalQty = quantity || 1;
        if (product.sellerMode === "wholesale" && finalQty < product.moq)
            return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });
        if (finalQty > variant.stock)
            return res.status(400).json({ message: "Insufficient stock" });

        const [sellerDoc, settings] = await Promise.all([
            product.seller ? Seller.findById(product.seller).select("commissionPercent") : Promise.resolve(null),
            AdminSettings.getSettings()
        ]);
        const defaultCommission = settings.defaultCommissionPercent ?? 10;
        const commissionPercent = sellerDoc?.commissionPercent ?? defaultCommission;

        const pricing = getBulkPrice(product, finalQty, variant.price);
        const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice = pricing.price;
        const totalPrice = parseFloat((unitPrice * finalQty).toFixed(2));
        const commissionAmount = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
        const sellerPayoutAmount = parseFloat((totalPrice - commissionAmount).toFixed(2));
        const taxRatePercent = product.taxRatePercent || 0;
        const taxAmount = parseFloat((totalPrice * taxRatePercent / 100).toFixed(2));
        const grandTotal = parseFloat((totalPrice + taxAmount).toFixed(2));

        // ── Online payment: return Razorpay order details ──────────────────
        if (ONLINE_METHODS.includes(paymentMethod)) {
            const rzpOrder = await razorpay.orders.create({
                amount: Math.round(grandTotal * 100),
                currency: "INR",
                receipt: `buynow_${req.user._id}_${Date.now()}`,
                notes: { userId: String(req.user._id), productId: String(productId) }
            });
            return res.status(201).json({
                type: "online",
                razorpayOrderId: rzpOrder.id,
                amount: grandTotal,
                currency: "INR",
                key: process.env.RAZORPAY_KEY_ID
            });
        }

        // ── COD: create order immediately ─────────────────────────────────
        const stockResult = await Product.updateOne(
            { _id: product._id, "variants._id": variantId, "variants.stock": { $gte: finalQty } },
            { $inc: { "variants.$.stock": -finalQty, totalStock: -finalQty } }
        );
        if (stockResult.modifiedCount === 0)
            return res.status(400).json({ message: "Insufficient stock" });

        let order;
        try {
            order = await Order.create({
                user: req.user._id,
                orderType: pricingMode === "wholesale" ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: [{
                    product: product._id,
                    store: product.store,
                    seller: product.seller,
                    variantId,
                    quantity: finalQty,
                    unitPrice, totalPrice, pricingMode,
                    appliedTier: pricing.appliedTier,
                    commissionPercent, commissionAmount, sellerPayoutAmount,
                    payoutStatus: "on_hold",
                    titleSnapshot: product.title,
                    skuSnapshot: variant.sku,
                    imageSnapshot: variant.images?.[0] || product.images?.[0] || ""
                }],
                shippingAddress, billingAddress, paymentMethod,
                paymentStatus: "pending",
                subtotal: totalPrice, taxAmount, shippingAmount: 0, grandTotal
            });
        } catch (err) {
            await Product.updateOne(
                { _id: product._id, "variants._id": variantId },
                { $inc: { "variants.$.stock": finalQty, totalStock: finalQty } }
            );
            throw err;
        }

        return res.status(201).json({ type: "cod", message: "Order placed successfully", order });
    } catch (error) {
        return res.status(500).json({ message: "Order placement failed", error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY NOW VERIFY  (online only)
// POST /api/users/payments/buy-now/verify
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature,
//         productId, variantId, quantity, shippingAddress, billingAddress, paymentMethod }
// ─────────────────────────────────────────────────────────────────────────────
async function verifyAndPlaceBuyNow(req, res) {
    try {
        const {
            razorpayOrderId, razorpayPaymentId, razorpaySignature,
            productId, variantId, quantity,
            shippingAddress, billingAddress, paymentMethod
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
            return res.status(400).json({ message: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required" });

        const expectedSig = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");
        if (expectedSig !== razorpaySignature)
            return res.status(400).json({ message: "Payment verification failed: invalid signature" });

        const addrError = validateAddress(shippingAddress, "shippingAddress") || validateAddress(billingAddress, "billingAddress");
        if (addrError) return res.status(400).json({ message: addrError });
        if (!paymentMethod) return res.status(400).json({ message: "paymentMethod is required" });

        const product = await Product.findById(productId);
        if (!product || !product.isActive) return res.status(404).json({ message: "Product not found" });

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) return res.status(404).json({ message: "Variant not found" });

        const finalQty = quantity || 1;
        if (product.sellerMode === "wholesale" && finalQty < product.moq)
            return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });
        if (finalQty > variant.stock)
            return res.status(400).json({ message: "Insufficient stock" });

        const [sellerDoc, settings] = await Promise.all([
            product.seller ? Seller.findById(product.seller).select("commissionPercent") : Promise.resolve(null),
            AdminSettings.getSettings()
        ]);
        const defaultCommission = settings.defaultCommissionPercent ?? 10;
        const commissionPercent = sellerDoc?.commissionPercent ?? defaultCommission;

        const pricing = getBulkPrice(product, finalQty, variant.price);
        const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice = pricing.price;
        const totalPrice = parseFloat((unitPrice * finalQty).toFixed(2));
        const commissionAmount = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
        const sellerPayoutAmount = parseFloat((totalPrice - commissionAmount).toFixed(2));
        const taxRatePercent = product.taxRatePercent || 0;
        const taxAmount = parseFloat((totalPrice * taxRatePercent / 100).toFixed(2));
        const grandTotal = parseFloat((totalPrice + taxAmount).toFixed(2));

        const stockResult = await Product.updateOne(
            { _id: product._id, "variants._id": variantId, "variants.stock": { $gte: finalQty } },
            { $inc: { "variants.$.stock": -finalQty, totalStock: -finalQty } }
        );
        if (stockResult.modifiedCount === 0)
            return res.status(400).json({ message: "Insufficient stock" });

        let order;
        try {
            order = await Order.create({
                user: req.user._id,
                orderType: pricingMode === "wholesale" ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: [{
                    product: product._id,
                    store: product.store,
                    seller: product.seller,
                    variantId,
                    quantity: finalQty,
                    unitPrice, totalPrice, pricingMode,
                    appliedTier: pricing.appliedTier,
                    commissionPercent, commissionAmount, sellerPayoutAmount,
                    payoutStatus: "on_hold",
                    titleSnapshot: product.title,
                    skuSnapshot: variant.sku,
                    imageSnapshot: variant.images?.[0] || product.images?.[0] || ""
                }],
                shippingAddress, billingAddress, paymentMethod,
                paymentStatus: "paid",
                razorpayOrderId, razorpayPaymentId, razorpaySignature,
                subtotal: totalPrice, taxAmount, shippingAmount: 0, grandTotal,
                paidAt: new Date()
            });
        } catch (err) {
            await Product.updateOne(
                { _id: product._id, "variants._id": variantId },
                { $inc: { "variants.$.stock": finalQty, totalStock: finalQty } }
            );
            throw err;
        }

        return res.status(201).json({ message: "Order placed successfully", order });
    } catch (error) {
        return res.status(500).json({ message: "Order placement failed", error: error.message });
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
        if (!item) return res.status(404).json({ message: "Order item not found" });

        if (item.status !== "delivered")
            return res.status(400).json({ message: "Return can only be requested for delivered items" });

        if (item.returnStatus !== "none")
            return res.status(400).json({ message: `Return already ${item.returnStatus}` });

        if (item.holdUntil && new Date() > item.holdUntil)
            return res.status(400).json({ message: "Return window has expired" });

        item.returnStatus = "requested";
        item.returnReason = reason || "";
        item.returnRequestedAt = new Date();
        await order.save();

        return res.json({ message: "Return requested successfully", itemId, returnStatus: item.returnStatus });
    } catch (error) {
        return res.status(500).json({ message: "Return request failed", error: error.message });
    }
}

module.exports = {
    cartCheckout,
    verifyAndPlaceCartOrder,
    buyNow,
    verifyAndPlaceBuyNow,
    requestReturn
};
