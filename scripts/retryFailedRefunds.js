/**
 * retryFailedRefunds.js
 *
 * Retries all pending refunds that could not be processed by initiateRefund().
 * Run manually or via a cron:
 *
 *   node scripts/retryFailedRefunds.js
 *   # or: 0 * * * * node /path/to/scripts/retryFailedRefunds.js   (hourly cron)
 *
 * On success: marks FailedRefund.status = "resolved".
 * On failure: leaves status = "pending" with updated lastError for the next run.
 */

"use strict";

require("dotenv").config();
const mongoose    = require("mongoose");
const Razorpay    = require("razorpay");
const FailedRefund = require("../models/FailedRefund");

const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("[RetryRefunds] connected to MongoDB");

    const pending = await FailedRefund.find({ status: "pending" }).sort({ createdAt: 1 });
    console.log(`[RetryRefunds] found ${pending.length} pending refund(s)`);

    let resolved = 0, failed = 0;

    for (const record of pending) {
        try {
            await razorpay.payments.refund(record.razorpayPaymentId, {
                amount: record.amountPaise,
                notes:  { reason: record.reason, retriedBy: "retryFailedRefunds.js" }
            });
            record.status     = "resolved";
            record.resolvedAt = new Date();
            record.resolvedBy = "retryFailedRefunds.js";
            await record.save();
            console.log(`[RetryRefunds] ✓ refunded ₹${record.amountPaise / 100} for ${record.razorpayPaymentId}`);
            resolved++;
        } catch (err) {
            record.attempts  += 1;
            record.lastError  = err.message;
            await record.save();
            console.error(`[RetryRefunds] ✗ failed for ${record.razorpayPaymentId}: ${err.message}`);
            failed++;
        }
    }

    console.log(`[RetryRefunds] done — resolved: ${resolved}, still failing: ${failed}`);
    await mongoose.disconnect();
}

run().catch(err => {
    console.error("[RetryRefunds] fatal:", err.message);
    process.exit(1);
});
