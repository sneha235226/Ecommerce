const express = require("express");
const { requireSellerAuth, requireAnySellerAuth } = require("../../middleware/auth");
const productRoutes = require("./productRoutes");
const storeRoutes = require("./storeRoutes");
const orderRoutes = require("./orderRoutes");
const contactQueryRoutes = require("./contactQueryRoutes");
const {
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
const dashboardRoutes = require("./dashboardRoutes");

const router = express.Router();

// Pre-approval routes — seller exists but may not be approved yet
router.get("/me", requireAnySellerAuth, getMySellerProfile);
router.patch("/update", requireAnySellerAuth, updateSeller);
router.post("/verify-pan", requireAnySellerAuth, verifySellerBusinessPan);
router.delete("/delete", requireAnySellerAuth, deleteSeller);

// KYC — Aadhaar & GST (require seller token, no approval needed)
router.post("/send-gst-otp", requireAnySellerAuth, sendOtpGst);
router.post("/verify-gst-otp", requireAnySellerAuth, verifyOtpGst);
router.post("/aadhaar/send-otp", requireAnySellerAuth, sendAadhaarOtp);
router.post("/aadhaar/verify-otp", requireAnySellerAuth, verifyOtpAadhar);
router.get("/aadhaar/:id", requireAnySellerAuth, getAadhaarById);

// Nested routes — require approved seller
router.use("/dashboard", requireSellerAuth, dashboardRoutes);
router.use("/products", requireSellerAuth, productRoutes);
router.use("/store", requireSellerAuth, storeRoutes);
router.use("/orders", requireSellerAuth, orderRoutes);
router.use("/flags", requireSellerAuth, flagRoutes);
router.use("/contact-queries", requireSellerAuth, contactQueryRoutes);

module.exports = router;
