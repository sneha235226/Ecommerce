const razorpay = require("../../config/razorpay");
const Order = require("../../models/Order");
const { releasePayout } = require("../../services/payoutService");

// GET /api/admins/orders
// Filter by return_requested, payout status, etc.
async function getOrders(req, res) {
    try {
        const { returnRequested, payoutStatus, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter = {};
        if (returnRequested === "true") {
            filter["items.returnStatus"] = "requested";
        }
        if (payoutStatus) {
            filter["items.payoutStatus"] = payoutStatus;
        }

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate("user", "firstName phone email"),
            Order.countDocuments(filter)
        ]);

        return res.status(200).json({ page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)), orders });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

// POST /api/admins/orders/:orderId/items/:itemId/approve-return
// Approves return, triggers Razorpay refund, cancels seller payout
async function approveReturn(req, res) {
    try {
        const { orderId, itemId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ message: "Order item not found" });

        if (item.returnStatus !== "requested") {
            return res.status(400).json({ message: `Cannot approve: return status is "${item.returnStatus}"` });
        }

        if (!order.razorpayPaymentId) {
            return res.status(400).json({ message: "No Razorpay payment found on this order (COD orders are refunded manually)" });
        }

        // Trigger Razorpay refund for this item's amount
        const amountPaise = Math.round(item.totalPrice * 100);
        const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
            amount: amountPaise,
            notes: {
                orderId: String(order._id),
                itemId: String(item._id),
                reason: item.returnReason || "return approved"
            }
        });

        item.returnStatus = "approved";
        item.refundId = refund.id;
        item.payoutStatus = "cancelled";
        item.status = "returned";

        // Update order-level paymentStatus
        const allRefunded = order.items.every(i => i.refundId || i.payoutStatus === "cancelled");
        if (allRefunded) {
            order.paymentStatus = "refunded";
            order.status = "returned";
        } else {
            order.paymentStatus = "partially_refunded";
        }

        order.refundedAmount = (order.refundedAmount || 0) + item.totalPrice;
        await order.save();

        return res.json({
            message: "Return approved and refund initiated",
            itemId,
            returnStatus: item.returnStatus,
            refundId: refund.id,
            refundAmount: item.totalPrice
        });
    } catch (error) {
        return res.status(500).json({ message: "Approve return failed", error: error.message });
    }
}

// POST /api/admins/orders/:orderId/items/:itemId/reject-return
// Rejects return, payout remains on_hold (will be released by cron after holdUntil)
async function rejectReturn(req, res) {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ message: "Order item not found" });

        if (item.returnStatus !== "requested") {
            return res.status(400).json({ message: `Cannot reject: return status is "${item.returnStatus}"` });
        }

        item.returnStatus = "rejected";
        if (reason) item.returnReason = reason;
        // payoutStatus stays on_hold — cron will release it when holdUntil passes

        await order.save();

        return res.json({
            message: "Return rejected. Seller payout will be released after the hold period.",
            itemId,
            returnStatus: item.returnStatus,
            payoutStatus: item.payoutStatus,
            holdUntil: item.holdUntil
        });
    } catch (error) {
        return res.status(500).json({ message: "Reject return failed", error: error.message });
    }
}

// POST /api/admins/orders/:orderId/items/:itemId/manual-payout
// Admin can manually trigger payout for a specific item (bypass cron)
async function triggerManualPayout(req, res) {
    try {
        const { orderId, itemId } = req.params;
        const payout = await releasePayout(orderId, itemId);
        return res.json({ message: "Payout triggered successfully", payoutId: payout.id });
    } catch (error) {
        return res.status(500).json({ message: "Manual payout failed", error: error.message });
    }
}

module.exports = { getOrders, approveReturn, rejectReturn, triggerManualPayout };
