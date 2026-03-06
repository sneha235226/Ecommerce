const express = require("express")
const { getSellerQueries, updateQueryStatus } = require("../../controllers/seller/contactQuery");

const router = express.Router()

// requireSellerAuth is already applied by the parent sellerRoutes.js router
router.get("/", getSellerQueries);
router.put("/:queryId", updateQueryStatus);

module.exports = router;