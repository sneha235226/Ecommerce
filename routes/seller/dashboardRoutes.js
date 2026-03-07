const express = require("express");
const { getSalesChart, getSellerOverview } = require("../../controllers/seller/DashboardController");

const router = express.Router();

router.get("/overview", getSellerOverview);
router.get("/sales", getSalesChart);

module.exports = router;
