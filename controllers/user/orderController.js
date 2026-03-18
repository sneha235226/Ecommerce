const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { deriveOrderStatus } = require("../../utils/orderUtils");
const { resolveUrl } = require("../../config/s3");

async function resolveOrderImages(orders) {
    const list = Array.isArray(orders) ? orders : [orders];
    await Promise.all(list.map((order) =>
        Promise.all(order.items.map(async (item) => {
            if (item.imageSnapshot) {
                item.imageSnapshot = await resolveUrl(item.imageSnapshot);
            }
        }))
    ));
}

async function getMyOrders(req, res) {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            Order.find({ user: req.user._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("items.product", "title images slug")
                .lean(),
            Order.countDocuments({ user: req.user._id })
        ]);

        await resolveOrderImages(orders);

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
        }).populate("items.product", "title images slug").lean();

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        await resolveOrderImages(order);

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
        item.payoutStatus = "cancelled";
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

module.exports = { getMyOrders, getMyOrderById, cancelOrderItem };
