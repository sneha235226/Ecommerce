const mongoose = require("mongoose");

/**
 * FailedRefund — persistent record when initiateRefund() exhausts all retries.
 *
 * Why: refund failures logged only to console can be lost on server restarts.
 * This collection ensures no money-owed record is ever silently dropped.
 *
 * Action required:
 *   Periodically query: db.failedrefunds.find({ status: "pending" })
 *   Then manually refund via Razorpay dashboard or run a retry script:
 *     node scripts/retryFailedRefunds.js
 */
const failedRefundSchema = new mongoose.Schema(
    {
        razorpayPaymentId: { type: String, required: true },
        amountPaise:       { type: Number, required: true },   // amount in paise (₹ × 100)
        reason:            { type: String, default: "" },
        attempts:          { type: Number, default: 0 },
        lastError:         { type: String, default: "" },
        status: {
            type:    String,
            enum:    ["pending", "resolved"],
            default: "pending"
        },
        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: String, default: "" }   // who resolved it (admin id / script)
    },
    { timestamps: true }
);

// Primary ops query: all pending refunds sorted oldest-first
failedRefundSchema.index({ status: 1, createdAt: 1 });

// Look up by payment to avoid duplicate records
failedRefundSchema.index({ razorpayPaymentId: 1 });

module.exports = mongoose.models.FailedRefund || mongoose.model("FailedRefund", failedRefundSchema);
