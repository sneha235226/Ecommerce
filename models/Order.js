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

const shipmentEventSchema = new mongoose.Schema(
  {
    status: { type: String, trim: true, required: true },
    message: { type: String, trim: true, default: "" },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, min: 1, required: true },
    unitPrice: { type: Number, min: 0, required: true },
    totalPrice: { type: Number, min: 0, required: true },
    pricingMode: { type: String, enum: ["retail", "wholesale", "hybrid"], default: "retail" },
    appliedTier: {
      minQty: { type: Number, min: 1, default: null },
      maxQty: { type: Number, min: 1, default: null },
      unitPrice: { type: Number, min: 0, default: null },
    },
    commissionPercent: { type: Number, min: 0, max: 100, default: 0 },
    commissionAmount: { type: Number, min: 0, default: 0 },
    sellerPayoutAmount: { type: Number, min: 0, default: 0 },
    // Payout tracking
    payoutStatus: {
      type: String,
      enum: ["on_hold", "paid", "cancelled"],
      default: "on_hold"
    },
    holdUntil: { type: Date, default: null },
    razorpayPayoutId: { type: String, trim: true, default: "" },
    // Return tracking
    returnStatus: {
      type: String,
      enum: ["none", "requested", "approved", "rejected", "completed"],
      default: "none"
    },
    returnReason: { type: String, trim: true, default: "" },
    returnRequestedAt: { type: Date, default: null },
    refundId: { type: String, trim: true, default: "" },
    titleSnapshot: { type: String, trim: true, required: true },
    skuSnapshot: { type: String, trim: true, required: true },
    imageSnapshot: { type: String, trim: true, default: "" },
    estimatedDeliveryDate: { type: Date, default: null },
    shipment: {
      carrier: { type: String, trim: true, default: "" },
      trackingNumber: { type: String, trim: true, default: "" },
      trackingUrl: { type: String, trim: true, default: "" },
      shippedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
      events: { type: [shipmentEventSchema], default: [] },
    },
    status: {
      type: String,
      enum: [
        "placed",
        "accepted",
        "rejected",
        "confirmed",
        "packed",
        "shipped",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
        "replacement_requested",
        "replacement_completed",
      ],
      default: "placed",
    },
    cancellationReason: { type: String, trim: true, default: "" },
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
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded", "partially_refunded"], default: "pending" },
    // Razorpay
    razorpayOrderId: { type: String, trim: true, default: "" },
    razorpayPaymentId: { type: String, trim: true, default: "" },
    razorpaySignature: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: [
        "placed",
        "accepted",
        "partially_shipped",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
        "refund_initiated",
        "refund_processed",
      ],
      default: "placed",
    },
    fulfillmentStatus: {
      type: String,
      enum: ["unfulfilled", "partially_fulfilled", "fulfilled"],
      default: "unfulfilled",
    },
    cancellationReason: { type: String, trim: true, default: "" },
    returnReason: { type: String, trim: true, default: "" },
    replacementRequested: { type: Boolean, default: false },
    replacementReason: { type: String, trim: true, default: "" },
    subtotal: { type: Number, min: 0, required: true },
    discountAmount: { type: Number, min: 0, default: 0 },
    shippingAmount: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, required: true },
    refundedAmount: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "INR" },
    couponCode: { type: String, trim: true, uppercase: true, default: "" },
    couponDiscountBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    taxBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    invoiceNumber: { type: String, trim: true, default: "" },
    invoiceUrl: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    deliverySpeed: { type: String, enum: ["standard", "express", "priority"], default: "standard" },
    placedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1, paymentStatus: 1 });
orderSchema.index({ "items.seller": 1, createdAt: -1 });
orderSchema.index({ "items.payoutStatus": 1, "items.holdUntil": 1 }); // cron payout queries

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
