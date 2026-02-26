const mongoose = require("mongoose");

const bulkPricingSchema = new mongoose.Schema(
  {
    minQty: { type: Number, min: 1, required: true },
    maxQty: { type: Number, min: 1, default: null },
    pricePerUnit: { type: Number, min: 0, required: true },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    message: { type: String, trim: true, default: "" },
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

const specificationSchema = new mongoose.Schema(
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
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Subcategory", default: null, index: true },
    title: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    shortDescription: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    tags: [{ type: String, trim: true }],
    searchKeywords: [{ type: String, trim: true }],
    baseSku: { type: String, trim: true, required: true },
    basePrice: { type: Number, min: 0 },
    baseCompareAtPrice: { type: Number, min: 0, default: null },
    totalStock: { type: Number, min: 0, default: 0 },
    images: [{ type: String, trim: true }],
    videos: [{ type: String, trim: true }],
    zoomImageEnabled: { type: Boolean, default: true },
    variants: { type: [variantSchema], default: [] },
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
    isPublished: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    targetAudience: { type: String, enum: ["B2C", "B2B", "both"], default: "B2C" },
    sellerMode: { type: String, enum: ["retail", "wholesale", "hybrid"], default: "retail" },
    moq: { type: Number, min: 1, default: 1 },
    bulkPricingEnabled: { type: Boolean, default: false },
    bulkPricing: { type: [bulkPricingSchema], default: [] },
    returnPolicy: { type: String, trim: true, default: "" },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    taxRatePercent: { type: Number, min: 0, max: 100, default: 0 },
    specifications: { type: [specificationSchema], default: [] },
    lowStockThreshold: { type: Number, min: 0, default: 5 },
    allowCod: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text", brand: "text", tags: "text", searchKeywords: "text" });
productSchema.index({ category: 1, subcategory: 1, isPublished: 1, createdAt: -1 });
productSchema.index({ store: 1, seller: 1, createdAt: -1 });
productSchema.index({ ratingAverage: -1, basePrice: 1 });

// Ensure unique slug per store
productSchema.index({ store: 1, slug: 1 }, { unique: true });

productSchema.pre("save", function (next) {
  if (Array.isArray(this.variants) && this.variants.length > 0) {
    this.totalStock = this.variants.reduce(
      (sum, v) => sum + (v.stock || 0),
      0
    );
  }
  next();
});

productSchema.pre("save", function (next) {
  if (Array.isArray(this.variants) && this.variants.length > 0) {
    const skus = this.variants.map((v) => v.sku);
    const uniqueSkus = new Set(skus);
    if (uniqueSkus.size !== skus.length) {
      return next(new Error("Duplicate variant SKU not allowed"));
    }
  }
  next();
});

productSchema.pre("save", function (next) {
  if (Array.isArray(this.variants) && this.variants.length > 0) {
    const prices = this.variants.map(v => v.price);
    this.basePrice = Math.min(...prices);
    const comparePrices = this.variants.map(v => v.compareAtPrice).filter(p => p && p > 0);
    this.baseCompareAtPrice = comparePrices.length
      ? Math.min(...comparePrices)
      : null;
  }
  next();
});

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);