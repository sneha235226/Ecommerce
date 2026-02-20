const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    level: { type: Number, min: 0, default: 0 },
    commissionOverrides: {
      retailCommissionPercent: { type: Number, min: 0, max: 100, default: null },
      wholesaleCommissionPercent: { type: Number, min: 0, max: 100, default: null },
      hybridCommissionPercent: { type: Number, min: 0, max: 100, default: null },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ parent: 1, sortOrder: 1 });

module.exports = mongoose.models.Category || mongoose.model("Category", categorySchema);
