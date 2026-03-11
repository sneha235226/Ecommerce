const express = require("express");
const { getOrders, approveReturn, rejectReturn, triggerManualPayout } = require("../../controllers/admin/orderController");

const router = express.Router();

router.get("/", getOrders);
router.post("/:orderId/items/:itemId/approve-return", approveReturn);
router.post("/:orderId/items/:itemId/reject-return", rejectReturn);
router.post("/:orderId/items/:itemId/manual-payout", triggerManualPayout);

module.exports = router;
