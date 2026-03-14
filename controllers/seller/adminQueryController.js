const AdminQuery = require("../../models/AdminQuery");

async function sendQuery(req, res) {
    try {
        const { subject, message, phone } = req.body;
        const seller = req.seller;

        if (!subject || !message) {
            return res.status(400).json({ message: "subject and message are required" });
        }

        const query = await AdminQuery.create({
            senderType: "seller",
            seller: seller._id,
            name: `${seller.firstName} ${seller.lastName || ""}`.trim(),
            email: seller.email,
            phone: phone || seller.phone || "",
            subject,
            message
        });

        return res.status(201).json({ message: "Query sent successfully", query });
    } catch (error) {
        return res.status(500).json({ message: "Failed to send query", error: error.message });
    }
}

async function getMyQueries(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [queries, total] = await Promise.all([
            AdminQuery.find({ seller: req.seller._id, senderType: "seller" })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            AdminQuery.countDocuments({ seller: req.seller._id, senderType: "seller" })
        ]);

        return res.status(200).json({ page, limit, total, totalPages: Math.ceil(total / limit), queries });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

module.exports = { sendQuery, getMyQueries };
