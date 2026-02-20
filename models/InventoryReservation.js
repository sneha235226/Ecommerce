const mongoose = require("mongoose");

const reservationItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, min: 1, required: true },
  },
  { _id: false }
);

const inventoryReservationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cart: { type: mongoose.Schema.Types.ObjectId, ref: "Cart", default: null, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    items: { type: [reservationItemSchema], default: [] },
    status: { type: String, enum: ["active", "converted", "released", "expired"], default: "active", index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.InventoryReservation || mongoose.model("InventoryReservation", inventoryReservationSchema);
