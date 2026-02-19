const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
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
    subtotal: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    shippingAmount: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "INR" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
