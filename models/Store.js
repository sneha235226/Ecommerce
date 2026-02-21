const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },
    bannerUrl: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    serviceablePostalCodes: [{ type: String, trim: true }],
    returnPolicy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

storeSchema.index({ name: "text", description: "text" });
storeSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.models.Store || mongoose.model("Store", storeSchema);
