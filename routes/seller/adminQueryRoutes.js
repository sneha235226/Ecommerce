const express = require("express");
const { sendQuery, getMyQueries } = require("../../controllers/seller/adminQueryController");

const router = express.Router();

// requireSellerAuth applied by parent sellerRoutes.js
router.post("/send", sendQuery);
router.get("/my-queries", getMyQueries);

module.exports = router;
