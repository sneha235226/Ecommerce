const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, trim: true, default: "" },
    comment: { type: String, trim: true, default: "" },
    images: [{ type: String, trim: true }],
    isVerifiedPurchase: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.models.Review || mongoose.model("Review", reviewSchema);
