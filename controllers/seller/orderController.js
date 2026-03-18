const Order = require("../../models/Order");
const Product = require("../../models/Product");
const AdminSettings = require("../../models/AdminSettings");
const { deriveOrderStatus } = require("../../utils/orderUtils");
const { resolveUrl } = require("../../config/s3");

async function getSellerOrders(req, res) {
    try {
        const sellerId = req.seller._id;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const status = req.query.status;
        let query;
        if (status) {
            query = {
                items: {
                    $elemMatch: { seller: sellerId, status }
                }
            };
        } else {
            query = { "items.seller": sellerId };
        }

        const [rawOrders, total] = await Promise.all([
            Order.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select("orderNumber items paymentMethod paymentStatus createdAt"),
            Order.countDocuments(query)
        ]);

        const orders = rawOrders.map(order => ({
            _id: order._id,
            orderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt,
            items: order.items.filter(item => String(item.seller) === String(sellerId))
        }));

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
            .populate("user", "firstName phone email")
            .populate("items.product", "title");

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        const sellerItems = order.items
            .filter(item => String(item.seller) === String(sellerId))
            .map(item => item.toObject());

        await Promise.all(sellerItems.map(async (item) => {
            if (item.imageSnapshot) {
                item.imageSnapshot = await resolveUrl(item.imageSnapshot);
            }
        }));

        res.status(200).json({
            orderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            shippingAddress: order.shippingAddress,
            customerEmail: order.user?.email ?? "",
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

        const seller = req.seller;

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

        if (status === "rejected" && prevStatus !== "rejected") {
            await Product.updateOne(
                { _id: item.product, "variants._id": item.variantId },
                { $inc: { "variants.$.stock": item.quantity, totalStock: item.quantity } }
            );
            item.payoutStatus = "cancelled";
        }

        // When item is delivered: start the return window, set payout on_hold
        if (status === "delivered" && prevStatus !== "delivered") {
            const settings = await AdminSettings.getSettings();
            const returnWindowDays = settings.returnWindowDays ?? 7;
            const holdUntil = new Date();
            holdUntil.setDate(holdUntil.getDate() + returnWindowDays);
            item.holdUntil = holdUntil;
            item.payoutStatus = "on_hold";
            if (!order.deliveredAt) order.deliveredAt = new Date();
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