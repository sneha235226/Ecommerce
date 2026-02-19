const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },
    bannerUrl: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    sellerType: {
      type: String,
      enum: ["B2C", "B2B", "both"],
      default: "B2C",
    },
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

storeSchema.index({ name: "text", description: "text" });

module.exports = mongoose.models.Store || mongoose.model("Store", storeSchema);
