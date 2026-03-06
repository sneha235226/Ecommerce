const mongoose = require("mongoose");

const contactQuerySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        phone: {
            type: String,
            trim: true,
            required: true
        },
        email: {
            type: String,
            trim: true,
            required: true
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
            index: true
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seller",
            required: true,
            index: true
        },
        store: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            required: true,
            index: true
        },
        subject: {
            type: String,
            trim: true,
            default: ""
        },
        message: {
            type: String,
            trim: true,
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "answered", "closed"],
            default: "pending"
        }
    },
    { timestamps: true }
)

module.exports = mongoose.models.ContactQuery || mongoose.model("ContactQuery", contactQuerySchema)