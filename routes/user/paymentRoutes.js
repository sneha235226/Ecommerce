const express = require("express");
const { requireUserAuth } = require("../../middleware/auth");
const {
    cartCheckout,
    verifyAndPlaceCartOrder,
    buyNow,
    verifyAndPlaceBuyNow,
    requestReturn
} = require("../../controllers/user/paymentController");

const router = express.Router();

// Cart
router.post("/cart/checkout", requireUserAuth, cartCheckout);   // COD → order | Online → razorpay details
router.post("/cart/verify", requireUserAuth, verifyAndPlaceCartOrder);  // online only: verify + place

// Buy now
router.post("/buy-now", requireUserAuth, buyNow);               // COD → order | Online → razorpay details
router.post("/buy-now/verify", requireUserAuth, verifyAndPlaceBuyNow);  // online only: verify + place

// Return
router.post("/orders/:orderId/items/:itemId/return", requireUserAuth, requestReturn);

module.exports = router;
