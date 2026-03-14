const mongoose = require("mongoose");

const adminQuerySchema = new mongoose.Schema(
    {
        senderType: {
            type: String,
            enum: ["user", "seller"],
            required: true,
            index: true
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seller",
            default: null,
            index: true
        },
        name: { type: String, trim: true, required: true },
        email: { type: String, trim: true, required: true },
        phone: { type: String, trim: true, default: "" },
        subject: { type: String, trim: true, required: true },
        message: { type: String, trim: true, required: true },
        status: {
            type: String,
            enum: ["pending", "answered", "closed"],
            default: "pending"
        },
        adminReply: { type: String, trim: true, default: "" },
        repliedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.models.AdminQuery || mongoose.model("AdminQuery", adminQuerySchema);
