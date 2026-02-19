const mongoose = require("mongoose");

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
    status: { type: String, enum: ["created", "pending", "success", "failed", "refunded"], default: "created" },
    failureReason: { type: String, trim: true, default: "" },
    paidAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentSchema.index({ providerPaymentId: 1 });
paymentSchema.index({ providerOrderId: 1 });

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
