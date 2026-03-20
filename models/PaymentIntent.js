const mongoose = require("mongoose");

/**
 * PaymentIntent — stores the complete order snapshot during the online payment window.
 *
 * Created at checkout initiation (cartCheckout / buyNow — online paths only).
 * Survives for 1 hour (4× the 15-min reservation TTL).
 *
 * Used by:
 *   /verify   — read snapshot so prices are locked to checkout time (not re-fetched live)
 *   Webhook   — recover & create order if the browser closed before /verify was called
 *
 * Deleted explicitly on successful order placement.
 * Auto-deleted by TTL after 1 hour if payment never completes.
 */
const paymentIntentSchema = new mongoose.Schema(
    {
        razorpayOrderId: { type: String, required: true, unique: true },
        userId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type:            { type: String, enum: ["cart", "buynow"], required: true },

        /**
         * Complete Order document (minus payment-time fields like razorpayPaymentId,
         * razorpaySignature, paymentStatus, paidAt — those are filled in at /verify).
         * Prices are locked to checkout-time values.
         */
        orderData: { type: mongoose.Schema.Types.Mixed, required: true },

        /**
         * Simplified ops for the atomic stock decrement.
         * Kept separate from orderData to avoid parsing the full order items array.
         */
        decrementOps: [
            {
                productId:     { type: mongoose.Schema.Types.ObjectId, required: true },
                variantId:     { type: mongoose.Schema.Types.ObjectId, required: true },
                qty:           { type: Number, required: true },
                titleSnapshot: { type: String, default: "" },
                _id: false
            }
        ],

        expiresAt: { type: Date, required: true }
    },
    { timestamps: true }
);

// TTL — auto-delete after expiresAt (set to 1 hour from checkout)
paymentIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Admin / debug lookup by user
paymentIntentSchema.index({ userId: 1 });

module.exports = mongoose.models.PaymentIntent || mongoose.model("PaymentIntent", paymentIntentSchema);
