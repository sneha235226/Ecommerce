const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true },
    imageUrl: { type: String, trim: true, default: "" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Subcategory || mongoose.model("Subcategory", subcategorySchema);
