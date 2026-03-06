const express = require("express")
const { requireSellerAuth } = require("../../middleware/auth");
const { getSellerQueries, updateQueryStatus } = require("../../controllers/seller/contactQuery");

const router = express.Router()

router.get("/", requireSellerAuth, getSellerQueries);
router.put("/:queryId", requireSellerAuth, updateQueryStatus);

module.exports = router