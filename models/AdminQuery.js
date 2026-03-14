const mongoose = require("mongoose");

const adminQuerySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
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
