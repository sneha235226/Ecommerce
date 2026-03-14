const express = require("express")
const { getSellerQueries, updateQueryStatus, replyToQuery } = require("../../controllers/seller/contactQuery");

const router = express.Router()

// requireSellerAuth is already applied by the parent sellerRoutes.js router
router.get("/", getSellerQueries);
router.post("/:queryId/reply", replyToQuery);
router.patch("/:queryId/status", updateQueryStatus);

module.exports = router;