const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, uppercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    discountType: { type: String, enum: ["percentage", "fixed"], required: true },
    discountValue: { type: Number, min: 0, required: true },
    maxDiscountAmount: { type: Number, min: 0, default: null },
    minOrderAmount: { type: Number, min: 0, default: 0 },
    usageLimit: { type: Number, min: 1, default: null },
    usedCount: { type: Number, min: 0, default: 0 },
    userUsageLimit: { type: Number, min: 1, default: 1 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    applicableStores: [{ type: mongoose.Schema.Types.ObjectId, ref: "Store" }],
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });

module.exports = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
