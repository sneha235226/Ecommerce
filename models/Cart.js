const mongoose = require("mongoose");

const appliedTierSchema = new mongoose.Schema(
  {
    minQty: { type: Number, min: 1, required: true },
    maxQty: { type: Number, min: 1, default: null },
    unitPrice: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, min: 1, default: 1 },
    minOrderQuantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
    effectiveUnitPrice: { type: Number, min: 0, required: true },
    lineTotal: { type: Number, min: 0, default: 0 },
    pricingMode: { type: String, enum: ["retail", "wholesale", "hybrid"], default: "retail" },
    appliedTier: { type: appliedTierSchema, default: null },
    isSavedForLater: { type: Boolean, default: false },
    estimatedShippingAmount: { type: Number, min: 0, default: 0 },
    titleSnapshot: { type: String, trim: true, required: true },
    skuSnapshot: { type: String, trim: true, required: true },
    imageSnapshot: { type: String, trim: true, default: "" },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    cartType: { type: String, enum: ["B2C", "B2B"], default: "B2C" },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, trim: true, uppercase: true, default: "" },
    shippingPostalCode: { type: String, trim: true, default: "" },
    deliverySpeed: { type: String, enum: ["standard", "express", "priority"], default: "standard" },
    subtotal: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    shippingAmount: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "INR" },
  },
  { timestamps: true }
);

cartSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
