const mongoose = require("mongoose");

const abuseReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
    message: String,
    reportedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);


const reviewSchema = new mongoose.Schema({
  reviewType: {
    type: String,
    enum: ["product", "seller", "store"],
    default: "product"
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    default: null
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller",
    default: null
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store",
    default: null
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  title: String,
  comment: String,
  images: [String],
  helpfulCount: {
    type: Number,
    default: 0
  },
  helpfulBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  abuseReportCount: {
    type: Number,
    default: 0
  },
  abuseReports: {
    type: [abuseReportSchema],
    default: []
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ seller: 1, createdAt: -1 });
reviewSchema.index({ user: 1, product: 1 }, { unique: true, partialFilterExpression: { reviewType: "product" } });
reviewSchema.index({ user: 1, seller: 1 }, { unique: true, partialFilterExpression: { reviewType: "seller" } });

module.exports = mongoose.models.Review || mongoose.model("Review", reviewSchema);