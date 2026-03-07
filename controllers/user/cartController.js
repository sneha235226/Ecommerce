const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const { getBulkPrice, generateOrderNumber } = require("../../utils/orderUtils");

// Derives the effective pricing mode for a single purchase
function resolvePricingMode(sellerMode, appliedTier) {
    if (sellerMode === "hybrid") return appliedTier ? "wholesale" : "retail";
    return sellerMode;
}

function validateAddress(addr, label) {
    const required = ["fullName", "phone", "line1", "city", "postalCode", "country"];
    for (const field of required) {
        if (!addr?.[field]?.toString().trim()) {
            return `${label}.${field} is required`;
        }
    }
    return null;
}

function calculateTotals(cart) {
    let subtotal = 0;
    let taxAmount = 0;

    cart.items.forEach(item => {
        item.lineTotal = parseFloat((item.unitPrice * item.quantity).toFixed(2));
        subtotal += item.lineTotal;
        taxAmount += parseFloat((item.lineTotal * (item.taxRatePercent || 0) / 100).toFixed(2));
    });

    cart.subtotal = parseFloat(subtotal.toFixed(2));
    cart.taxAmount = parseFloat(taxAmount.toFixed(2));
    cart.shippingAmount = cart.shippingAmount || 0;
    cart.discountAmount = cart.discountAmount || 0;
    cart.grandTotal = parseFloat(
        (cart.subtotal + cart.shippingAmount + cart.taxAmount - cart.discountAmount).toFixed(2)
    );
}

async function addToCart(req, res) {
    try {
        const userId = req.user._id;
        const { productId, variantId, quantity } = req.body;

        if (!productId || !variantId) {
            return res.status(400).json({ message: "productId & variantId required" });
        }

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ message: "Product not available" });
        }

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) {
            return res.status(404).json({ message: "Variant not available" });
        }

        let finalQty = quantity || 1;

        // Enforce MOQ for wholesale-only products (hybrid allows retail quantities)
        if (product.sellerMode === "wholesale" && finalQty < product.moq) {
            return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });
        }

        if (finalQty > variant.stock) {
            return res.status(400).json({ message: "Insufficient stock" });
        }

        const pricing = getBulkPrice(product, finalQty, variant.price);
        const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = await Cart.create({ user: userId, items: [] });
        }

        // Match by both productId AND variantId for correctness
        const existingItem = cart.items.find(
            i => String(i.product) === String(productId) && String(i.variantId) === String(variantId)
        );

        if (existingItem) {
            const newQty = existingItem.quantity + finalQty;
            if (newQty > variant.stock) {
                return res.status(400).json({
                    message: `Only ${variant.stock} units available (already have ${existingItem.quantity} in cart)`
                });
            }
            const newPricing = getBulkPrice(product, newQty, variant.price);
            existingItem.quantity = newQty;
            existingItem.unitPrice = newPricing.price;
            existingItem.appliedTier = newPricing.appliedTier;
            existingItem.pricingMode = resolvePricingMode(product.sellerMode, newPricing.appliedTier);
        } else {
            cart.items.push({
                product: product._id,
                store: product.store,
                seller: product.seller,
                variantId,
                quantity: finalQty,
                unitPrice: pricing.price,
                appliedTier: pricing.appliedTier,
                pricingMode,
                taxRatePercent: product.taxRatePercent || 0,
                titleSnapshot: product.title,
                skuSnapshot: variant.sku,
                imageSnapshot: variant.images?.[0] || product.images?.[0] || ""
            });
        }

        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Added to cart successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Add failed", error: error.message });
    }
}

async function getCart(req, res) {
    try {
        const cart = await Cart.findOne({ user: req.user._id }).populate("items.product", "title images");
        if (!cart) {
            return res.json({ message: "Cart is empty", cart: { items: [], subtotal: 0, taxAmount: 0, shippingAmount: 0, discountAmount: 0, grandTotal: 0 } });
        }
        res.status(200).json({ message: "Cart fetched successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

async function updateQuantity(req, res) {
    try {
        const { productId, variantId, quantity } = req.body;

        if (!variantId) {
            return res.status(400).json({ message: "variantId required" });
        }
        if (quantity < 1) {
            return res.status(400).json({ message: "Invalid quantity" });
        }

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        const item = cart.items.find(
            i => String(i.variantId) === String(variantId) &&
                (!productId || String(i.product) === String(productId))
        );
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        const product = await Product.findById(item.product);
        if (!product || !product.isActive) {
            return res.status(404).json({ message: "Product not found or unavailable" });
        }

        const variant = product.variants.id(item.variantId);
        if (!variant || !variant.isActive) {
            return res.status(404).json({ message: "Variant not found or unavailable" });
        }

        if (quantity > variant.stock) {
            return res.status(400).json({ message: `Only ${variant.stock} units available` });
        }

        if (product.sellerMode === "wholesale" && quantity < product.moq) {
            return res.status(400).json({ message: `Minimum quantity is ${product.moq}` });
        }

        const pricing = getBulkPrice(product, quantity, variant.price);
        item.quantity = quantity;
        item.unitPrice = pricing.price;
        item.appliedTier = pricing.appliedTier;
        item.pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        item.taxRatePercent = product.taxRatePercent || 0;

        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Quantity updated successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Update failed", error: error.message });
    }
}

async function removeItem(req, res) {
    try {
        const { productId, variantId } = req.body;

        if (!variantId) {
            return res.status(400).json({ message: "variantId required" });
        }

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        const beforeCount = cart.items.length;
        cart.items = cart.items.filter(i => {
            const variantMatch = String(i.variantId) !== String(variantId);
            const productMatch = productId ? String(i.product) !== String(productId) : false;
            return variantMatch || productMatch;
        });

        if (beforeCount === cart.items.length) {
            return res.status(404).json({ message: "Item not found in cart" });
        }

        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Item removed successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Remove failed", error: error.message });
    }
}

async function clearCart(req, res) {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.json({ message: "Cart empty" });
        }
        cart.items = [];
        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Cart cleared successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Clear failed", error: error.message });
    }
}

async function checkoutCart(req, res) {
    try {
        const userId = req.user._id;
        const {
            shippingAddress,
            billingAddress,
            paymentMethod,
            shippingAmount: reqShipping
        } = req.body;

        // ── Validate addresses up-front ────────────────────────────────────
        const addrError =
            validateAddress(shippingAddress, "shippingAddress") ||
            validateAddress(billingAddress, "billingAddress");
        if (addrError) {
            return res.status(400).json({ message: addrError });
        }

        if (!paymentMethod) {
            return res.status(400).json({ message: "paymentMethod is required" });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ message: "Cart empty" });
        }

        // ── Step 1: Validate all items ─────────────────────────────────────
        const resolvedItems = [];
        for (const item of cart.items) {
            const product = await Product.findById(item.product);
            if (!product || !product.isActive) {
                return res.status(400).json({
                    message: `Product "${item.titleSnapshot}" is no longer available. Please remove it from your cart.`
                });
            }

            const variant = product.variants.id(item.variantId);
            if (!variant || !variant.isActive) {
                return res.status(400).json({
                    message: `Variant for "${item.titleSnapshot}" is no longer available.`
                });
            }

            if (item.quantity > variant.stock) {
                return res.status(400).json({
                    message: `Insufficient stock for "${item.titleSnapshot}". Only ${variant.stock} left.`
                });
            }

            if (product.sellerMode === "wholesale" && item.quantity < product.moq) {
                return res.status(400).json({
                    message: `"${item.titleSnapshot}" requires a minimum quantity of ${product.moq}.`
                });
            }

            resolvedItems.push({ item, product, variant });
        }

        // ── Step 2: Fetch seller commissions (one DB call for all sellers) ─
        const uniqueSellerIds = [
            ...new Set(
                resolvedItems
                    .map(r => r.item.seller)
                    .filter(Boolean)
                    .map(String)
            )
        ];

        const sellerDocs = await Seller.find(
            { _id: { $in: uniqueSellerIds } },
            { commissionPercent: 1 }
        );

        const sellerCommissionMap = {};
        for (const s of sellerDocs) {
            sellerCommissionMap[String(s._id)] = s.commissionPercent ?? 10;
        }

        // ── Step 3: Atomic stock decrements + build order items ───────────
        let orderItems = [];
        let subtotal = 0;
        let taxAmount = 0;
        let hasWholesaleItem = false;
        const stockDecrements = [];

        for (const { item, product, variant } of resolvedItems) {
            const pricing = getBulkPrice(product, item.quantity, variant.price);
            const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
            const unitPrice = pricing.price;
            const totalPrice = parseFloat((unitPrice * item.quantity).toFixed(2));

            // B2B only when wholesale pricing actually applied
            if (pricingMode === "wholesale") hasWholesaleItem = true;

            const stockResult = await Product.updateOne(
                {
                    _id: item.product,
                    "variants._id": item.variantId,
                    "variants.stock": { $gte: item.quantity }
                },
                { $inc: { "variants.$.stock": -item.quantity, totalStock: -item.quantity } }
            );

            if (stockResult.modifiedCount === 0) {
                // Compensate all prior decrements before returning
                for (const dec of stockDecrements) {
                    await Product.updateOne(
                        { _id: dec.productId, "variants._id": dec.variantId },
                        { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                    );
                }
                return res.status(400).json({
                    message: `Insufficient stock for "${item.titleSnapshot}". Please refresh your cart.`
                });
            }

            stockDecrements.push({ productId: item.product, variantId: item.variantId, qty: item.quantity });

            const commissionPercent = item.seller
                ? (sellerCommissionMap[String(item.seller)] ?? 10)
                : 0;
            const commissionAmount = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
            const sellerPayoutAmount = parseFloat((totalPrice - commissionAmount).toFixed(2));

            const itemTaxRate = product.taxRatePercent || 0;
            const itemTaxAmount = parseFloat((totalPrice * itemTaxRate / 100).toFixed(2));
            taxAmount += itemTaxAmount;

            subtotal += totalPrice;

            orderItems.push({
                product: item.product,
                store: item.store,
                seller: item.seller,
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice,
                totalPrice,
                pricingMode,
                appliedTier: pricing.appliedTier,
                commissionPercent,
                commissionAmount,
                sellerPayoutAmount,
                titleSnapshot: item.titleSnapshot,
                skuSnapshot: item.skuSnapshot,
                imageSnapshot: item.imageSnapshot
            });
        }

        subtotal = parseFloat(subtotal.toFixed(2));
        taxAmount = parseFloat(taxAmount.toFixed(2));
        const shippingAmount = parseFloat((reqShipping || 0).toFixed(2));
        const grandTotal = parseFloat((subtotal + taxAmount + shippingAmount).toFixed(2));

        // ── Step 4: Create order ───────────────────────────────────────────
        let order;
        try {
            order = await Order.create({
                user: userId,
                orderType: hasWholesaleItem ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: orderItems,
                shippingAddress,
                billingAddress,
                paymentMethod,
                subtotal,
                taxAmount,
                shippingAmount,
                grandTotal
            });
        } catch (err) {
            // Restore all stock if order creation fails
            for (const dec of stockDecrements) {
                await Product.updateOne(
                    { _id: dec.productId, "variants._id": dec.variantId },
                    { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                );
            }
            throw err;
        }

        // ── Step 5: Clear cart ─────────────────────────────────────────────
        cart.items = [];
        cart.subtotal = 0;
        cart.taxAmount = 0;
        cart.shippingAmount = 0;
        cart.discountAmount = 0;
        cart.grandTotal = 0;
        await cart.save();

        res.json({ message: "Order placed successfully", order });
    } catch (error) {
        res.status(500).json({ message: "Checkout failed", error: error.message });
    }
}

module.exports = {
    addToCart,
    getCart,
    updateQuantity,
    removeItem,
    clearCart,
    checkoutCart
};
