const express = require("express");
const {
  getOverview,
  getRevenueChart,
  getOrdersBreakdown,
  getDisputesList,
} = require("../../controllers/admin/dashboardController");

const router = express.Router();

router.get("/overview", getOverview);
router.get("/revenue", getRevenueChart);
router.get("/orders", getOrdersBreakdown);
router.get("/disputes", getDisputesList);

module.exports = router;
