const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null, index: true },
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },
    bannerUrl: { type: String, trim: true, default: "" },
    supportEmail: { type: String, trim: true, lowercase: true, default: "" },
    supportPhone: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    taxId: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    sellerType: { type: String, enum: ["B2C", "B2B", "both"], default: "B2C" },
    serviceablePostalCodes: [{ type: String, trim: true }],
    defaultLeadTimeDays: { type: Number, min: 0, default: 0 },
    returnPolicy: { type: String, trim: true, default: "" },
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

storeSchema.index({ name: "text", description: "text" });
storeSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.models.Store || mongoose.model("Store", storeSchema);
