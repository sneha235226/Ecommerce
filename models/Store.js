const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    description: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },
    bannerUrl: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    sellerMode: { type: String, enum: ["retail", "wholesale", "hybrid"], default: "retail", index: true },
    serviceablePostalCodes: [{ type: String, trim: true }],
    returnPolicy: { type: String, trim: true, default: "" },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  { timestamps: true }
);

storeSchema.index({ seller: 1, createdAt: -1 });
storeSchema.index({ location: "2dsphere" });

module.exports = mongoose.models.Store || mongoose.model("Store", storeSchema);
