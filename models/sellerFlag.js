const mongoose = require("mongoose");

const userFlagSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Seller",
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null
    },
    reason: {
        type: String,
        enum: [
            "too_many_returns",
            "fake_orders",
            "payment_issue",
            "abusive_behavior",
            "other"
        ],
        required: true
    },
    message: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

userFlagSchema.index({ user: 1, seller: 1, order: 1 }, { unique: true });
userFlagSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.models.SellerFlag || mongoose.model("SellerFlag", userFlagSchema);