const Notification = require("../../models/Notification");

// GET /users/notifications
async function getNotifications(req, res) {
    try {
        const page  = Number(req.query.page)  || 1;
        const limit = Number(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find({ recipientUser: req.user._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments({ recipientUser: req.user._id }),
            Notification.countDocuments({ recipientUser: req.user._id, isRead: false }),
        ]);

        res.json({ notifications, total, unreadCount, page, limit });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// GET /users/notifications/unread-count
async function getUnreadCount(req, res) {
    try {
        const count = await Notification.countDocuments({ recipientUser: req.user._id, isRead: false });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// PATCH /users/notifications/:id/read
async function markOneRead(req, res) {
    try {
        const notif = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientUser: req.user._id },
            { isRead: true, readAt: new Date() },
            { new: true }
        );
        if (!notif) return res.status(404).json({ message: "Notification not found" });
        res.json({ message: "Marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// PATCH /users/notifications/read-all
async function markAllRead(req, res) {
    try {
        await Notification.updateMany(
            { recipientUser: req.user._id, isRead: false },
            { isRead: true, readAt: new Date() }
        );
        res.json({ message: "All notifications marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = { getNotifications, getUnreadCount, markOneRead, markAllRead };
