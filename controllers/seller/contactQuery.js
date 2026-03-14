const ContactQuery = require("../../models/ContactQuery")
const { sendSellerReplyEmail } = require("../../services/emailService")

async function getSellerQueries(req, res) {
    try {
        const sellerId = req.seller._id;

        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const skip = (page - 1) * limit

        const query = { seller: sellerId }

        const queries = await ContactQuery.find(query)
            .populate("product", "title images")
            .populate("user", "firstName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await ContactQuery.countDocuments(query)

        return res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            queries
        })
    }
    catch (error) {
        return res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

async function updateQueryStatus(req, res) {
    try {
        const { queryId } = req.params
        const { status } = req.body

        if (!["pending", "answered", "closed"].includes(status)) {
            return res.status(400).json({
                message: "Invalid status"
            })
        }

        const query = await ContactQuery.findByIdAndUpdate(
            queryId,
            { status },
            { new: true }
        )

        if (!query) {
            return res.status(404).json({
                message: "Query not found"
            })
        }

        return res.status(200).json({
            message: "Status updated successfully",
            query
        })
    }
    catch (error) {
        return res.status(500).json({
            message: "Update failed",
            error: error.message
        })
    }
}

async function replyToQuery(req, res) {
    try {
        const { queryId } = req.params
        const { sellerReply } = req.body

        if (!sellerReply) {
            return res.status(400).json({ message: "sellerReply is required" })
        }

        const query = await ContactQuery.findOne({ _id: queryId, seller: req.seller._id })
            .populate("product", "title")
            .populate("user", "firstName lastName")
        if (!query) return res.status(404).json({ message: "Query not found" })

        query.sellerReply = sellerReply
        query.repliedAt = new Date()
        query.status = "answered"
        await query.save()

        // Send email notification (non-blocking)
        const toName = query.user
            ? `${query.user.firstName} ${query.user.lastName || ""}`.trim()
            : query.email;
        sendSellerReplyEmail({
            toEmail: query.email,
            toName,
            subject: query.subject,
            originalMessage: query.message,
            sellerReply,
            productTitle: query.product?.title || ""
        }).catch(err => console.error("[email] Seller reply email failed:", err.message));

        return res.status(200).json({ message: "Reply sent successfully", query })
    } catch (error) {
        return res.status(500).json({ message: "Reply failed", error: error.message })
    }
}

module.exports = {
    getSellerQueries,
    updateQueryStatus,
    replyToQuery
}
