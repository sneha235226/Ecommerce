const mongoose = require("mongoose");

const escrowSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
    grossAmount: { type: Number, min: 0, required: true },
    commissionAmount: { type: Number, min: 0, default: 0 },
    refundableAmount: { type: Number, min: 0, default: 0 },
    netPayoutAmount: { type: Number, min: 0, required: true },
    status: {
      type: String,
      enum: ["held", "release_scheduled", "released", "hold_extended", "refunded"],
      default: "held",
      index: true,
    },
    holdReason: { type: String, trim: true, default: "" },
    holdUntil: { type: Date, default: null },
    scheduledReleaseAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    settlementReference: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

escrowSchema.index({ seller: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Escrow || mongoose.model("Escrow", escrowSchema);
