const mongoose = require("mongoose");

const appliedTierSchema = new mongoose.Schema(
  {
    minQty: Number,
    maxQty: Number,
    unitPrice: Number
  },
  { _id: false }
);

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store",
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller"
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  quantity: {
    type: Number,
    min: 1,
    default: 1
  },
  unitPrice: {
    type: Number,
    min: 0,
    required: true
  },
  lineTotal: {
    type: Number,
    min: 0,
    default: 0
  },
  pricingMode: {
    type: String,
    enum: ["retail", "wholesale", "hybrid"],
    default: "retail"
  },
  appliedTier: {
    type: appliedTierSchema,
    default: null
  },
  titleSnapshot: {
    type: String,
    required: true
  },
  skuSnapshot: {
    type: String,
    required: true
  },
  imageSnapshot: {
    type: String,
    default: ""
  },
  taxRatePercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  }
});


const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  items: {
    type: [cartItemSchema],
    default: []
  },
  subtotal: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  shippingAmount: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    default: 0
  }
},
  { timestamps: true }
);


module.exports =
  mongoose.models.Cart ||
  mongoose.model("Cart", cartSchema);