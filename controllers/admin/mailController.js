const User = require("../../models/User");
const Seller = require("../../models/Seller");
const { sendAnnouncementEmail } = require("../../services/emailService");

// Send mail to a specific user by userId
async function sendMailToUser(req, res) {
    try {
        const { userId, subject, body } = req.body;
        if (!userId || !subject || !body) {
            return res.status(400).json({ message: "userId, subject, and body are required" });
        }

        const user = await User.findById(userId).select("firstName lastName email");
        if (!user) return res.status(404).json({ message: "User not found" });

        await sendAnnouncementEmail({
            toEmail: user.email,
            toName: `${user.firstName} ${user.lastName || ""}`.trim(),
            subject,
            body
        });

        return res.status(200).json({ message: `Mail sent to ${user.email}` });
    } catch (error) {
        return res.status(500).json({ message: "Failed to send mail", error: error.message });
    }
}

// Send mail to a specific seller by sellerId
async function sendMailToSeller(req, res) {
    try {
        const { sellerId, subject, body } = req.body;
        if (!sellerId || !subject || !body) {
            return res.status(400).json({ message: "sellerId, subject, and body are required" });
        }

        const seller = await Seller.findById(sellerId).select("firstName lastName email");
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        await sendAnnouncementEmail({
            toEmail: seller.email,
            toName: `${seller.firstName} ${seller.lastName || ""}`.trim(),
            subject,
            body
        });

        return res.status(200).json({ message: `Mail sent to ${seller.email}` });
    } catch (error) {
        return res.status(500).json({ message: "Failed to send mail", error: error.message });
    }
}

// Broadcast to all users
async function broadcastToAllUsers(req, res) {
    try {
        const { subject, body } = req.body;
        if (!subject || !body) {
            return res.status(400).json({ message: "subject and body are required" });
        }

        const users = await User.find({}, "firstName lastName email");
        let sent = 0, failed = 0;

        for (const user of users) {
            try {
                await sendAnnouncementEmail({
                    toEmail: user.email,
                    toName: `${user.firstName} ${user.lastName || ""}`.trim(),
                    subject,
                    body
                });
                sent++;
            } catch {
                failed++;
            }
        }

        return res.status(200).json({ message: "Broadcast complete", sent, failed, total: users.length });
    } catch (error) {
        return res.status(500).json({ message: "Broadcast failed", error: error.message });
    }
}

// Broadcast to all sellers
async function broadcastToAllSellers(req, res) {
    try {
        const { subject, body } = req.body;
        if (!subject || !body) {
            return res.status(400).json({ message: "subject and body are required" });
        }

        const sellers = await Seller.find({ status: "approved" }, "firstName lastName email");
        let sent = 0, failed = 0;

        for (const seller of sellers) {
            try {
                await sendAnnouncementEmail({
                    toEmail: seller.email,
                    toName: `${seller.firstName} ${seller.lastName || ""}`.trim(),
                    subject,
                    body
                });
                sent++;
            } catch {
                failed++;
            }
        }

        return res.status(200).json({ message: "Broadcast complete", sent, failed, total: sellers.length });
    } catch (error) {
        return res.status(500).json({ message: "Broadcast failed", error: error.message });
    }
}

module.exports = {
    sendMailToUser,
    sendMailToSeller,
    broadcastToAllUsers,
    broadcastToAllSellers
};
