const express = require("express");
const { requireSellerAuth, requireAnySellerAuth, requireOnboardingComplete } = require("../../middleware/auth");
const productRoutes = require("./productRoutes");
const storeRoutes = require("./storeRoutes");
const orderRoutes = require("./orderRoutes");
const contactQueryRoutes = require("./contactQueryRoutes");
const flagRoutes = require("./flagRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const adminQueryRoutes = require("./adminQueryRoutes");
const notificationRoutes = require("./notificationRoutes");

const {
  getMySellerProfile,
  verifySellerBusinessPan,
  deleteSeller,
  sendAadhaarOtp,
  verifyOtpAadhar,
  getAadhaarById
} = require("../../controllers/seller/sellerController");

const {
  getOnboardingStatus,
  verifyBank,
  verifyGST,
  verifyMSME,
  getProfileReview,
  updateOnboardingProfile
} = require("../../controllers/seller/onboardingController");

const router = express.Router();

router.get("/me", requireAnySellerAuth, getMySellerProfile);
router.get("/me/status", requireAnySellerAuth, (req, res) => {
  res.status(200).json({ status: req.seller.status, isActive: req.seller.isActive });
});
router.delete("/delete", requireAnySellerAuth, deleteSeller);

// ─── Onboarding routes ────────────────────────────────────────────
router.post("/aadhaar/send-otp", requireAnySellerAuth, sendAadhaarOtp);
router.post("/aadhaar/verify-otp", requireAnySellerAuth, verifyOtpAadhar);
router.get("/aadhaar/:id", requireAnySellerAuth, getAadhaarById);
router.post("/verify-pan", requireAnySellerAuth, verifySellerBusinessPan);
router.get("/onboarding/status", requireAnySellerAuth, getOnboardingStatus);
router.post("/onboarding/verify-bank", requireAnySellerAuth, verifyBank);
router.post("/onboarding/verify-gst", requireAnySellerAuth, verifyGST);
router.post("/onboarding/verify-msme", requireAnySellerAuth, verifyMSME);

// profile review
router.get("/onboarding/profile-review", requireAnySellerAuth, getProfileReview);
router.patch("/onboarding/profile", requireAnySellerAuth, updateOnboardingProfile);

// Store and product creation additionally require full KYC onboarding
router.use("/store", requireSellerAuth, requireOnboardingComplete, storeRoutes);
router.use("/products", requireSellerAuth, requireOnboardingComplete, productRoutes);
router.use("/dashboard", requireSellerAuth, dashboardRoutes);
router.use("/orders", requireSellerAuth, orderRoutes);
router.use("/flags", requireSellerAuth, flagRoutes);
router.use("/contact-queries", requireSellerAuth, contactQueryRoutes);
router.use("/admin-query", requireSellerAuth, adminQueryRoutes);
router.use("/notifications", requireSellerAuth, notificationRoutes);

module.exports = router;
