const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Category || mongoose.model("Category", categorySchema);
