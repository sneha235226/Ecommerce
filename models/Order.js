const mongoose = require("mongoose");

const orderAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    line1: { type: String, trim: true, required: true },
    line2: { type: String, trim: true, default: "" },
    landmark: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, required: true },
    state: { type: String, trim: true, required: true },
    postalCode: { type: String, trim: true, required: true },
    country: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, min: 1, required: true },
    unitPrice: { type: Number, min: 0, required: true },
    totalPrice: { type: Number, min: 0, required: true },
    titleSnapshot: { type: String, trim: true, required: true },
    skuSnapshot: { type: String, trim: true, required: true },
    imageSnapshot: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"],
      default: "placed",
    },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderType: { type: String, enum: ["B2C", "B2B"], default: "B2C" },
    orderNumber: { type: String, trim: true, unique: true, required: true },
    items: { type: [orderItemSchema], default: [] },
    shippingAddress: { type: orderAddressSchema, required: true },
    billingAddress: { type: orderAddressSchema, required: true },
    paymentMethod: { type: String, enum: ["cod", "upi", "card", "netbanking", "wallet"], required: true },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    status: {
      type: String,
      enum: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"],
      default: "placed",
    },
    subtotal: { type: Number, min: 0, required: true },
    discountAmount: { type: Number, min: 0, default: 0 },
    shippingAmount: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, required: true },
    currency: { type: String, trim: true, uppercase: true, default: "INR" },
    couponCode: { type: String, trim: true, uppercase: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    placedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
