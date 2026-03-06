const express = require("express");
const { requireAuth, requireSellerAuth, requireUserAuth } = require("../../middleware/auth");
const productRoutes = require("./productRoutes");
const storeRoutes = require("./storeRoutes");
const orderRoutes = require("./orderRoutes");
const contactQueryRoutes = require("./contactQueryRoutes");
const {
  createSeller,
  getMySellerProfile,
  updateSeller,
  verifySellerBusinessPan,
  deleteSeller,
  sendAadhaarOtp,
  verifyOtpAadhar,
  getAadhaarById,
  sendOtpGst,
  verifyOtpGst
} = require("../../controllers/seller/sellerController");
const flagRoutes = require("./flagRoutes");

const router = express.Router();

router.post("/", requireAuth, createSeller);

// Seller routes first
router.get("/me", requireSellerAuth, getMySellerProfile);
router.patch("/update", requireSellerAuth, updateSeller);
router.post("/verify-pan", requireSellerAuth, verifySellerBusinessPan);
router.post("/send-gst-otp", sendOtpGst);
router.post("/verify-gst-otp", verifyOtpGst);
router.post("/otp", requireUserAuth, sendAadhaarOtp);
router.post("/otp/verify", requireUserAuth, verifyOtpAadhar);
router.get("/aadhaar/:id", requireUserAuth, getAadhaarById);
router.delete("/delete", requireSellerAuth, deleteSeller);

// Nested routes
router.use("/products", requireAuth, requireSellerAuth, productRoutes);
router.use("/store", requireAuth, requireSellerAuth, storeRoutes);
router.use("/orders", requireAuth, requireSellerAuth, orderRoutes);
router.use("/flags", requireAuth, requireSellerAuth, flagRoutes);
router.use("/contact-queries", requireAuth, requireSellerAuth, contactQueryRoutes);

module.exports = router;
