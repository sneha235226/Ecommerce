const mongoose = require("mongoose");

const disputeSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    reasonCode: {
      type: String,
      enum: ["not_delivered", "wrong_item", "damaged", "quality_issue", "refund_delay", "other"],
      required: true,
    },
    description: { type: String, trim: true, default: "" },
    evidence: [{ type: String, trim: true }],
    status: { type: String, enum: ["open", "under_review", "resolved", "rejected"], default: "open", index: true },
    resolution: {
      action: { type: String, enum: ["refund", "replacement", "partial_refund", "seller_payout_release", "none"], default: "none" },
      amount: { type: Number, min: 0, default: 0 },
      remarks: { type: String, trim: true, default: "" },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      resolvedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Dispute || mongoose.model("Dispute", disputeSchema);
