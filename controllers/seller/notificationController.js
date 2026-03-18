const Notification = require("../../models/Notification");
const User = require("../../models/User");

// GET /sellers/notifications/received
async function getReceived(req, res) {
    try {
        const page  = Number(req.query.page)  || 1;
        const limit = Number(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find({ recipientSeller: req.seller._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments({ recipientSeller: req.seller._id }),
            Notification.countDocuments({ recipientSeller: req.seller._id, isRead: false }),
        ]);

        res.json({ notifications, total, unreadCount, page, limit });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// GET /sellers/notifications/unread-count
async function getUnreadCount(req, res) {
    try {
        const count = await Notification.countDocuments({ recipientSeller: req.seller._id, isRead: false });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// PATCH /sellers/notifications/:id/read
async function markOneRead(req, res) {
    try {
        const notif = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientSeller: req.seller._id },
            { isRead: true, readAt: new Date() },
            { new: true }
        );
        if (!notif) return res.status(404).json({ message: "Notification not found" });
        res.json({ message: "Marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// PATCH /sellers/notifications/read-all
async function markAllRead(req, res) {
    try {
        await Notification.updateMany(
            { recipientSeller: req.seller._id, isRead: false },
            { isRead: true, readAt: new Date() }
        );
        res.json({ message: "All notifications marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// POST /sellers/notifications/send
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
            senderType: "seller",
            senderSeller: req.seller._id,
            title,
            message,
        });
        res.json({ message: "Notification sent to user" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// GET /sellers/notifications/sent
async function getSentHistory(req, res) {
    try {
        const page  = Number(req.query.page)  || 1;
        const limit = Number(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        const [notifications, total] = await Promise.all([
            Notification.find({ senderSeller: req.seller._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments({ senderSeller: req.seller._id }),
        ]);

        res.json({ notifications, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = { getReceived, getUnreadCount, markOneRead, markAllRead, sendToUser, getSentHistory };
