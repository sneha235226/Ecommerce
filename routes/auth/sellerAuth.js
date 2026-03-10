const express = require("express");
const {
  register,
  login,
  sendEmailOtp,
  verifyEmail,
  sendSmsOtp,
  verifySmsOtp,
  loginWithEmailOtp,
  loginWithPhoneOtp,
} = require("../../controllers/auth/sellerAuthController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/send-email-otp", sendEmailOtp);
router.post("/verify-email", verifyEmail);
router.post("/send-sms-otp", sendSmsOtp);
router.post("/verify-sms-otp", verifySmsOtp);
router.post("/login/email-otp", loginWithEmailOtp);
router.post("/login/phone-otp", loginWithPhoneOtp);

module.exports = router;
