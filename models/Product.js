const mongoose = require("mongoose");

const bulkPricingSchema = new mongoose.Schema(
  {
    minQty: { type: Number, min: 1, required: true },
    pricePerUnit: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const attributeSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, required: true },
    value: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    color: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    price: { type: Number, min: 0, required: true },
    compareAtPrice: { type: Number, min: 0, default: null },
    costPrice: { type: Number, min: 0, default: null },
    stock: { type: Number, min: 0, default: 0 },
    images: [{ type: String, trim: true }],
    attributes: { type: [attributeSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    title: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    tags: [{ type: String, trim: true }],
    baseSku: { type: String, trim: true, required: true },
    basePrice: { type: Number, min: 0, required: true },
    baseCompareAtPrice: { type: Number, min: 0, default: null },
    totalStock: { type: Number, min: 0, default: 0 },
    images: [{ type: String, trim: true }],
    variants: { type: [variantSchema], default: [] },
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    isPublished: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    targetAudience: {
      type: String,
      enum: ["B2C", "B2B", "both"],
      default: "B2C",
    },
    moq: { type: Number, min: 1, default: 1 },
    bulkPricing: { type: [bulkPricingSchema], default: [] },
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text", brand: "text", tags: "text" });
productSchema.index({ category: 1, isPublished: 1, createdAt: -1 });
productSchema.index({ store: 1, createdAt: -1 });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
