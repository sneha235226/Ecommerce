const mongoose = require("mongoose");

const abuseReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, trim: true, required: true },
    message: { type: String, trim: true, default: "" },
    reportedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const reviewSchema = new mongoose.Schema(
  {
    reviewType: { type: String, enum: ["product", "seller"], default: "product", index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, trim: true, default: "" },
    comment: { type: String, trim: true, default: "" },
    images: [{ type: String, trim: true }],
    helpfulCount: { type: Number, min: 0, default: 0 },
    helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    abuseReportCount: { type: Number, min: 0, default: 0 },
    abuseReports: { type: [abuseReportSchema], default: [] },
    isVerifiedPurchase: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    moderationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ seller: 1, createdAt: -1 });
reviewSchema.index({ user: 1, product: 1 }, { unique: true, partialFilterExpression: { reviewType: "product" } });
reviewSchema.index({ user: 1, seller: 1 }, { unique: true, partialFilterExpression: { reviewType: "seller" } });

module.exports = mongoose.models.Review || mongoose.model("Review", reviewSchema);
