const cron = require("node-cron");
const Order = require("../models/Order");
const { releasePayout } = require("../services/payoutService");

// Runs every hour — finds eligible items and releases seller payouts.
// Eligible = payoutStatus:on_hold AND holdUntil <= now AND returnStatus in [none, rejected]
function startPayoutCron() {
    cron.schedule("0 * * * *", async () => {
        console.log("[payoutCron] Running payout release check:", new Date().toISOString());

        try {
            // Find orders with at least one eligible item
            const orders = await Order.find({
                items: {
                    $elemMatch: {
                        payoutStatus: "on_hold",
                        returnStatus: { $in: ["none", "rejected"] },
                        holdUntil: { $lte: new Date() }
                    }
                }
            }).select("_id items");

            let released = 0;
            let failed = 0;

            for (const order of orders) {
                const eligibleItems = order.items.filter(
                    item =>
                        item.payoutStatus === "on_hold" &&
                        (item.returnStatus === "none" || item.returnStatus === "rejected") &&
                        item.holdUntil &&
                        item.holdUntil <= new Date()
                );

                for (const item of eligibleItems) {
                    try {
                        await releasePayout(String(order._id), String(item._id));
                        released++;
                        console.log(`[payoutCron] Released payout for order ${order._id} item ${item._id}`);
                    } catch (err) {
                        failed++;
                        console.error(`[payoutCron] Failed payout for order ${order._id} item ${item._id}:`, err.message);
                    }
                }
            }

            console.log(`[payoutCron] Done. Released: ${released}, Failed: ${failed}`);
        } catch (err) {
            console.error("[payoutCron] Cron error:", err.message);
        }
    });

    console.log("[payoutCron] Payout cron scheduled (every hour)");
}

module.exports = { startPayoutCron };
