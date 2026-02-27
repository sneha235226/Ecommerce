const express = require("express");
const { getSellerOrders, getSellerOrderById, updateOrderItemStatus } = require("../../controllers/seller/orderController");

const router = express.Router();

router.get("/all-orders", getSellerOrders);
router.get("/:id", getSellerOrderById);
router.patch("/:orderId/item/:itemId/status", updateOrderItemStatus);

module.exports = router;