const mongoose = require("mongoose");

const paymentAttemptSchema = new mongoose.Schema(
  {
    providerPaymentId: { type: String, trim: true, default: "" },
    providerOrderId: { type: String, trim: true, default: "" },
    providerSignature: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["created", "pending", "success", "failed"], default: "created" },
    failureReason: { type: String, trim: true, default: "" },
    attemptedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const refundSchema = new mongoose.Schema(
  {
    amount: { type: Number, min: 0, required: true },
    reason: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["initiated", "processing", "processed", "failed"], default: "initiated" },
    providerRefundId: { type: String, trim: true, default: "" },
    processedAt: { type: Date, default: null },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, trim: true, required: true },
    providerPaymentId: { type: String, trim: true, default: "" },
    providerOrderId: { type: String, trim: true, default: "" },
    providerSignature: { type: String, trim: true, default: "" },
    amount: { type: Number, min: 0, required: true },
    currency: { type: String, trim: true, uppercase: true, default: "INR" },
    method: { type: String, enum: ["cod", "upi", "card", "netbanking", "wallet"], required: true },
    status: { type: String, enum: ["created", "pending", "success", "failed", "refunded", "partially_refunded"], default: "created" },
    failureReason: { type: String, trim: true, default: "" },
    paidAt: { type: Date, default: null },
    retryCount: { type: Number, min: 0, default: 0 },
    attempts: { type: [paymentAttemptSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentSchema.index({ providerPaymentId: 1 });
paymentSchema.index({ providerOrderId: 1 });
paymentSchema.index({ order: 1, status: 1 });

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
