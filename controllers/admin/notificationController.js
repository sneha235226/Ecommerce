const Notification = require("../../models/Notification");
const User = require("../../models/User");
const Seller = require("../../models/Seller");

// POST /admins/notifications/send/user
async function sendToUser(req, res) {
    try {
        const { userId, title, message } = req.body;
        if (!userId || !title || !message) {
            return res.status(400).json({ message: "userId, title and message are required" });
        }
        const user = await User.findById(userId).select("_id");
        if (!user) return res.status(404).json({ message: "User not found" });

        await Notification.create({
            recipientUser: userId,
            senderType: "admin",
            senderAdmin: req.user._id,
            title,
            message,
        });
        res.json({ message: "Notification sent to user" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// POST /admins/notifications/send/seller
async function sendToSeller(req, res) {
    try {
        const { sellerId, title, message } = req.body;
        if (!sellerId || !title || !message) {
            return res.status(400).json({ message: "sellerId, title and message are required" });
        }
        const seller = await Seller.findById(sellerId).select("_id");
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        await Notification.create({
            recipientSeller: sellerId,
            senderType: "admin",
            senderAdmin: req.user._id,
            title,
            message,
        });
        res.json({ message: "Notification sent to seller" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// POST /admins/notifications/broadcast/users
async function broadcastToUsers(req, res) {
    try {
        const { title, message } = req.body;
        if (!title || !message) {
            return res.status(400).json({ message: "title and message are required" });
        }
        const users = await User.find({ isBlocked: { $ne: true } }).select("_id");
        if (users.length === 0) return res.json({ message: "No active users found", count: 0 });

        const docs = users.map(u => ({
            recipientUser: u._id,
            senderType: "admin",
            senderAdmin: req.user._id,
            title,
            message,
        }));
        await Notification.insertMany(docs);
        res.json({ message: `Notification sent to ${docs.length} users`, count: docs.length });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// POST /admins/notifications/broadcast/sellers
async function broadcastToSellers(req, res) {
    try {
        const { title, message } = req.body;
        if (!title || !message) {
            return res.status(400).json({ message: "title and message are required" });
        }
        const sellers = await Seller.find({ status: "approved" }).select("_id");
        if (sellers.length === 0) return res.json({ message: "No approved sellers found", count: 0 });

        const docs = sellers.map(s => ({
            recipientSeller: s._id,
            senderType: "admin",
            senderAdmin: req.user._id,
            title,
            message,
        }));
        await Notification.insertMany(docs);
        res.json({ message: `Notification sent to ${docs.length} sellers`, count: docs.length });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// GET /admins/notifications/sent
async function getSentHistory(req, res) {
    try {
        const page  = Number(req.query.page)  || 1;
        const limit = Number(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        const [notifications, total] = await Promise.all([
            Notification.find({ senderAdmin: req.user._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments({ senderAdmin: req.user._id }),
        ]);

        res.json({ notifications, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = { sendToUser, sendToSeller, broadcastToUsers, broadcastToSellers, getSentHistory };
