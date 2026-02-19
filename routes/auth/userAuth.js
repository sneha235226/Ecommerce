const express = require("express");
const { requireUserAuth } = require("../../middleware/auth");
const { register, login, me, verifyEmail, resendVerification } = require("../../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireUserAuth, me);
router.post("/verify-email", requireUserAuth, verifyEmail);
router.post("/resend-verification", requireUserAuth, resendVerification);

module.exports = router;
