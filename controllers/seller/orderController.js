const Order = require("../../models/Order");
const Seller = require("../../models/Seller");
const Product = require("../../models/Product");

async function getSellerOrders(req, res) {
    try {
        const seller = await Seller.findOne({
            user: req.user._id
        });

        if (!seller) {
            return res.status(404).json({
                message: "Seller not found"
            });
        }

        const sellerId = seller._id;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const status = req.query.status;
        let query = {
            "items.seller": sellerId
        };

        if (status) {
            query.items = {
                $elemMatch: {
                    seller: sellerId,
                    status: status
                }
            };
        }

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("orderNumber items paymentMethod paymentStatus createdAt");

        const total = await Order.countDocuments(query);
        res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            orders
        });
    } catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function getSellerOrderById(req, res) {
    try {
        const sellerId = req.seller._id;
        const order = await Order.findOne({
            _id: req.params.id,
            "items.seller": sellerId
        })
            .populate("user", "firstName phone")
            .populate("items.product", "title");

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        const sellerItems = order.items.filter(
            item => String(item.seller) === String(sellerId)
        );

        res.status(200).json({
            orderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            shippingAddress: order.shippingAddress,
            items: sellerItems,
            createdAt: order.createdAt
        });

    } catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

function deriveOrderStatus(items) {
    const statuses = items.map(i => i.status)
    if (statuses.every(s => s === "delivered")) return "delivered"
    if (statuses.every(s => s === "cancelled" || s === "rejected")) return "cancelled"
    if (statuses.some(s => s === "shipped" || s === "delivered")) return "partially_shipped"
    if (statuses.every(s => s === "placed" || s === "accepted" || s === "confirmed" || s === "packed" || s === "rejected" || s === "cancelled")) return "accepted"
    return "placed"
}

async function updateOrderItemStatus(req, res) {
    try {
        const { orderId, itemId } = req.params
        const { status } = req.body

        const allowedStatuses = ["accepted", "rejected", "confirmed", "packed", "shipped", "delivered"]
        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: `Status must be one of: ${allowedStatuses.join(", ")}`
            })
        }

        const seller = await Seller.findOne({ user: req.user._id })
        if (!seller) {
            return res.status(404).json({ message: "Seller not found" })
        }

        const order = await Order.findOne({
            _id: orderId,
            "items.seller": seller._id
        })
        if (!order) {
            return res.status(404).json({ message: "Order not found" })
        }

        const item = order.items.id(itemId)
        if (!item || String(item.seller) !== String(seller._id)) {
            return res.status(404).json({ message: "Item not found or not yours" })
        }

        const prevStatus = item.status
        item.status = status

        // Restore stock on rejection
        if (status === "rejected" && prevStatus !== "rejected") {
            const product = await Product.findById(item.product)
            if (product) {
                const variant = product.variants.id(item.variantId)
                if (variant) {
                    variant.stock += item.quantity
                    await product.save()
                }
            }
        }

        order.status = deriveOrderStatus(order.items)
        await order.save()
        res.status(200).json({
            message: `Item status updated to ${status}`,
            itemId,
            newStatus: status,
            orderStatus: order.status
        })
    } catch (error) {
        res.status(500).json({
            message: "Update failed",
            error: error.message
        })
    }
}

module.exports = {
    getSellerOrders,
    getSellerOrderById,
    updateOrderItemStatus
};