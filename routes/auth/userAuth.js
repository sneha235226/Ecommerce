const express = require("express");
const { requireUserAuth } = require("../../middleware/auth");
const { register, login, sendEmailOtp, verifyEmail, sendSmsOtp, verifySmsOtp, loginWithEmailOtp, loginWithPhoneOtp } = require("../../controllers/auth/userAuthController");

const router = express.Router();


// Login endpoints
// 1. Email & Password: /login (POST)
// 2. Phone & Password: /login (POST) (same endpoint, pass phone instead of email)
// 3. Email & OTP: /login-email-otp (POST)
// 4. Phone & OTP: /login-phone-otp (POST)

router.post("/register", register); 
router.post("/login", login); // email+password or phone+password
router.post("/login-email-otp", loginWithEmailOtp); // email+otp
router.post("/login-phone-otp", loginWithPhoneOtp); // phone+otp
router.post("/send-sms-otp", sendSmsOtp);
router.post("/verify-sms-otp", verifySmsOtp);
router.post("/send-email-otp", sendEmailOtp);
router.post("/verify-email-otp", verifyEmail);

module.exports = router;
