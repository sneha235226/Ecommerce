const express = require("express");
const router = express.Router();
const { flagUser, getSellerFlags } = require("../../controllers/seller/flagController");

router.post("/user", flagUser);
router.get("/users", getSellerFlags);

module.exports = router;