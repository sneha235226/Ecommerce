const AdminQuery = require("../../models/AdminQuery");
const { sendAdminReplyEmail } = require("../../services/emailService");

async function getAllQueries(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { status } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (req.query.senderType) filter.senderType = req.query.senderType;

        const [queries, total] = await Promise.all([
            AdminQuery.find(filter)
                .populate("user", "firstName lastName email phone")
                .populate("seller", "firstName lastName email phone")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            AdminQuery.countDocuments(filter)
        ]);

        return res.status(200).json({ page, limit, total, totalPages: Math.ceil(total / limit), queries });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

async function replyToQuery(req, res) {
    try {
        const { queryId } = req.params;
        const { adminReply, status } = req.body;

        if (!adminReply) {
            return res.status(400).json({ message: "adminReply is required" });
        }

        const query = await AdminQuery.findById(queryId);
        if (!query) return res.status(404).json({ message: "Query not found" });

        query.adminReply = adminReply;
        query.repliedAt = new Date();
        query.status = status || "answered";
        await query.save();

        // Send email notification (non-blocking — don't fail the request if email fails)
        sendAdminReplyEmail({
            toEmail: query.email,
            toName: query.name,
            subject: query.subject,
            originalMessage: query.message,
            adminReply
        }).catch(err => console.error("[email] Admin reply email failed:", err.message));

        return res.status(200).json({ message: "Reply sent successfully", query });
    } catch (error) {
        return res.status(500).json({ message: "Reply failed", error: error.message });
    }
}

async function updateQueryStatus(req, res) {
    try {
        const { queryId } = req.params;
        const { status } = req.body;

        if (!["pending", "answered", "closed"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const query = await AdminQuery.findByIdAndUpdate(queryId, { status }, { new: true });
        if (!query) return res.status(404).json({ message: "Query not found" });

        return res.status(200).json({ message: "Status updated", query });
    } catch (error) {
        return res.status(500).json({ message: "Update failed", error: error.message });
    }
}

module.exports = { getAllQueries, replyToQuery, updateQueryStatus };

