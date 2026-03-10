const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const AdminSettings = require("../../models/AdminSettings");
const { getBulkPrice, generateOrderNumber, deriveOrderStatus } = require("../../utils/orderUtils");

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

async function buyNow(req, res) {
    try {
        const userId = req.user._id;
        const {
            productId,
            variantId,
            quantity,
            shippingAddress,
            billingAddress,
            paymentMethod
        } = req.body;

        // Validate addresses early
        const addrError =
            validateAddress(shippingAddress, "shippingAddress") ||
            validateAddress(billingAddress, "billingAddress");
        if (addrError) {
            return res.status(400).json({ message: addrError });
        }

        if (!paymentMethod) {
            return res.status(400).json({ message: "paymentMethod is required" });
        }

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ message: "Product not found" });
        }

        if (product.sellerMode === "wholesale") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled) {
                return res.status(403).json({ message: "Wholesale products are currently unavailable" });
            }
        }

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) {
            return res.status(404).json({ message: "Variant not found" });
        }

        let finalQty = quantity || 1;

        if (product.sellerMode === "wholesale" && finalQty < product.moq) {
            return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });
        }

        if (finalQty > variant.stock) {
            return res.status(400).json({ message: "Insufficient stock" });
        }

        const pricing = getBulkPrice(product, finalQty, variant.price);
        const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        const unitPrice = pricing.price;
        const totalPrice = parseFloat((unitPrice * finalQty).toFixed(2));

        // Commission & payout
        const [sellerDoc, settings] = await Promise.all([
            product.seller ? Seller.findById(product.seller).select("commissionPercent") : Promise.resolve(null),
            AdminSettings.getSettings()
        ]);
        const defaultCommission = settings.defaultCommissionPercent ?? 10;
        const commissionPercent = sellerDoc?.commissionPercent ?? defaultCommission;
        const commissionAmount = parseFloat((totalPrice * commissionPercent / 100).toFixed(2));
        const sellerPayoutAmount = parseFloat((totalPrice - commissionAmount).toFixed(2));

        // Tax
        const taxRatePercent = product.taxRatePercent || 0;
        const taxAmount = parseFloat((totalPrice * taxRatePercent / 100).toFixed(2));
        const grandTotal = parseFloat((totalPrice + taxAmount).toFixed(2));

        const item = {
            product: product._id,
            store: product.store,
            seller: product.seller,
            variantId,
            quantity: finalQty,
            unitPrice,
            totalPrice,
            pricingMode,
            appliedTier: pricing.appliedTier,
            commissionPercent,
            commissionAmount,
            sellerPayoutAmount,
            titleSnapshot: product.title,
            skuSnapshot: variant.sku,
            imageSnapshot: variant.images?.[0] || product.images?.[0] || ""
        };

        // Atomic stock decrement — prevents race conditions / overselling
        const stockResult = await Product.updateOne(
            { _id: product._id, "variants._id": variantId, "variants.stock": { $gte: finalQty } },
            { $inc: { "variants.$.stock": -finalQty, totalStock: -finalQty } }
        );

        if (stockResult.modifiedCount === 0) {
            return res.status(400).json({ message: "Insufficient stock" });
        }

        let order;
        try {
            order = await Order.create({
                user: userId,
                orderType: pricingMode === "wholesale" ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: [item],
                shippingAddress,
                billingAddress,
                paymentMethod,
                subtotal: totalPrice,
                taxAmount,
                grandTotal
            });
        } catch (err) {
            await Product.updateOne(
                { _id: product._id, "variants._id": variantId },
                { $inc: { "variants.$.stock": finalQty, totalStock: finalQty } }
            );
            throw err;
        }

        res.status(201).json({ message: "Order created successfully", order });
    } catch (error) {
        res.status(500).json({ message: "Order creation failed", error: error.message });
    }
}

async function getMyOrders(req, res) {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("items.product", "title images");

        const total = await Order.countDocuments({ user: req.user._id });

        res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            orders
        });
    } catch (error) {
        res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

async function getMyOrderById(req, res) {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.user._id
        }).populate("items.product", "title images");

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        res.status(200).json({ message: "Order fetched successfully", order });
    } catch (error) {
        res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

async function cancelOrderItem(req, res) {
    try {
        const { orderId } = req.params;
        const { itemId, reason } = req.body;

        if (!itemId) {
            return res.status(400).json({ message: "itemId required" });
        }

        const order = await Order.findOne({ _id: orderId, user: req.user._id });
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({ message: "Item not found in order" });
        }

        const cancellableStatuses = ["placed", "accepted"];
        if (!cancellableStatuses.includes(item.status)) {
            return res.status(400).json({
                message: `Cannot cancel item with status "${item.status}". Only placed or accepted items can be cancelled.`
            });
        }

        item.status = "cancelled";
        if (reason) item.cancellationReason = reason;

        await Product.updateOne(
            { _id: item.product, "variants._id": item.variantId },
            { $inc: { "variants.$.stock": item.quantity, totalStock: item.quantity } }
        );

        order.status = deriveOrderStatus(order.items);
        await order.save();

        res.status(200).json({
            message: "Item cancelled successfully",
            itemId,
            orderStatus: order.status
        });
    } catch (error) {
        res.status(500).json({ message: "Cancellation failed", error: error.message });
    }
}

module.exports = { buyNow, getMyOrders, getMyOrderById, cancelOrderItem };
