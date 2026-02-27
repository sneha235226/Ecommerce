const express = require("express")
const { requireUserAuth } = require("../../middleware/auth");
const { buyNow, getMyOrders, getMyOrderById, cancelOrderItem } = require("../../controllers/user/orderController");

const router = express.Router()

router.post("/buy-now", requireUserAuth, buyNow);
router.get("/my-orders", requireUserAuth, getMyOrders);
router.get("/my-orders/:id", requireUserAuth, getMyOrderById);
router.patch("/cancel-item/:orderId", requireUserAuth, cancelOrderItem);

module.exports = router