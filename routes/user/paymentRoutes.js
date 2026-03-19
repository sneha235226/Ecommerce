const express = require("express");
const { requireUserAuth } = require("../../middleware/auth");
const {
    cartCheckout,
    verifyAndPlaceCartOrder,
    buyNow,
    verifyAndPlaceBuyNow,
    releaseReservation,
    razorpayWebhook,
    requestReturn
} = require("../../controllers/user/paymentController");

const router = express.Router();

// Cart
router.post("/cart/checkout", requireUserAuth, cartCheckout);   // COD → order | Online → razorpay details
router.post("/cart/verify", requireUserAuth, verifyAndPlaceCartOrder);  // online only: verify + place

// Buy now
router.post("/buy-now", requireUserAuth, buyNow);               // COD → order | Online → razorpay details
router.post("/buy-now/verify", requireUserAuth, verifyAndPlaceBuyNow);  // online only: verify + place

// Reservation release (user cancels payment modal)
router.delete("/reservation", requireUserAuth, releaseReservation); // Release reserved stock for both cart and buy now scenarios

// Razorpay webhook — no auth, raw body required
router.post("/webhook/razorpay", razorpayWebhook);

// Return
router.post("/orders/:orderId/items/:itemId/return", requireUserAuth, requestReturn);

module.exports = router;
