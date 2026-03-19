const mongoose = require("mongoose");

/**
 * ReservedStock — soft lock for stock during online checkout.
 *
 * One document per (user, product, variantId) — upserted on each checkout.
 * MongoDB TTL index auto-deletes expired reservations after `expiresAt`.
 *
 * Flow:
 *   checkout initiation → create/update reservation (15 min TTL)
 *   payment verify      → use reservation, then delete it
 *   payment failure     → let TTL expire OR call releaseUserReservations()
 */
const reservedStockSchema = new mongoose.Schema(
    {
        user:            { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
        product:         { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        variantId:       { type: mongoose.Schema.Types.ObjectId, required: true },
        quantity:        { type: Number, min: 1, required: true },
        razorpayOrderId: { type: String, trim: true, default: "" }, // links to the Razorpay order
        expiresAt:       { type: Date, required: true },
    },
    { timestamps: true }
);

// TTL index — MongoDB removes document automatically when expiresAt passes
reservedStockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// One reservation per user × product × variant (upserted, not duplicated)
reservedStockSchema.index({ user: 1, product: 1, variantId: 1 }, { unique: true });

// Used in aggregation to sum reserved quantity for a given variant
reservedStockSchema.index({ product: 1, variantId: 1, expiresAt: 1 });

// Used to release reservations by Razorpay order on success/failure
reservedStockSchema.index({ razorpayOrderId: 1 });

// Used to release all reservations for a user
reservedStockSchema.index({ user: 1 });

module.exports = mongoose.models.ReservedStock || mongoose.model("ReservedStock", reservedStockSchema);
