const express = require("express");
const { getSellerOrders, getSellerOrderById } = require("../../controllers/seller/orderController");

const router = express.Router();

router.get("/all-orders", getSellerOrders);
router.get("/:id", getSellerOrderById);

module.exports = router;