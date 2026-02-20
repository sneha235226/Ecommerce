const mongoose = require("mongoose");

const commissionRuleSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ["global", "category", "seller"], default: "global", index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null, index: true },
    retailCommissionPercent: { type: Number, min: 0, max: 100, default: 12 },
    wholesaleCommissionPercent: { type: Number, min: 0, max: 100, default: 5 },
    hybridCommissionPercent: { type: Number, min: 0, max: 100, default: 8 },
    isActive: { type: Boolean, default: true },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

commissionRuleSchema.index({ scope: 1, isActive: 1, startsAt: -1 });

module.exports = mongoose.models.CommissionRule || mongoose.model("CommissionRule", commissionRuleSchema);
