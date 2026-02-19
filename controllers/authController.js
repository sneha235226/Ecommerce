const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { generateAuthToken } = require("../utils/token");
const { sendOtpEmail } = require("../utils/mailer");

const OTP_EXPIRY_MS = 10 * 60 * 1000;      // 10 minutes
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes

function generateOtp() {
  const otp = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, "0");
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  return { otp, hashedOtp };
}

function buildUserResponse(user) {
  const role = user.role || (user.constructor?.modelName === "Admin" ? "admin" : "customer");
  const response = {
    id: user._id,
    gender: user.gender,
    email: user.email,
    phone: user.phone,
    role,
    isEmailVerified: user.isEmailVerified,
  };
  if (user.firstName !== undefined) response.firstName = user.firstName;
  if (user.lastName !== undefined) response.lastName = user.lastName;
  return response;
}

async function register(req, res) {
  try {
    const { firstName, lastName, gender, email, phone, password, role } = req.body;

    if (!firstName || !password) {
      return res.status(400).json({ message: "firstName and password are required" });
    }

    if (!email && !phone) {
      return res.status(400).json({ message: "Provide at least email or phone" });
    }

    const identifiers = [];
    if (email) identifiers.push({ email });
    if (phone) identifiers.push({ phone });

    const existingUser = await User.findOne({ $or: identifiers });
    const existingAdmin = await Admin.findOne({ $or: identifiers });
    const existing = existingUser || existingAdmin;
    if (existing) {
      return res.status(409).json({ message: "User already exists with email or phone" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const allowedSelfSignupRoles = new Set(["customer", "seller"]);
    const safeRole = allowedSelfSignupRoles.has(role) ? role : "customer";

    const user = await User.create({
      firstName,
      lastName,
      gender,
      email,
      phone,
      passwordHash,
      role: safeRole,
    });

    // Send OTP if email was provided
    if (email) {
      try {
        const { otp, hashedOtp } = generateOtp();
        await User.findByIdAndUpdate(user._id, {
          emailVerificationOtp: hashedOtp,
          emailVerificationExpires: new Date(Date.now() + OTP_EXPIRY_MS),
        });
        await sendOtpEmail(email, otp);
      } catch (mailErr) {
        // Non-fatal: user is created, OTP send failure is logged
        console.error("OTP email failed:", mailErr.message);
      }
    }

    return res.status(201).json({
      message: email
        ? "Registration successful. An OTP has been sent to your email — please verify your account."
        : "Registration successful",
      user: buildUserResponse(user),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "User already exists with email or phone" });
    }
    return res.status(500).json({ message: "Unable to register user", error: error.message });
  }
}

async function login(req, res) {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({ message: "Provide email or phone and password" });
    }

    const identifiers = [];
    if (email) identifiers.push({ email });
    if (phone) identifiers.push({ phone });

    const user = await User.findOne({ $or: identifiers });

    if (!user || user.isActive === false) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isAdmin = user.constructor?.modelName === "Admin";
    if (!isAdmin) {
      user.lastLoginAt = new Date();
      await user.save();
    }

    const token = generateAuthToken(user, isAdmin ? "admin" : user.role);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to login", error: error.message });
  }
}

function me(req, res) {
  return res.status(200).json({ user: req.user });
}

async function verifyEmail(req, res) {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    if (req.user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const userWithOtp = await User.findById(req.user._id)
      .select("+emailVerificationOtp +emailVerificationExpires");

    if (!userWithOtp) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!userWithOtp.emailVerificationOtp || !userWithOtp.emailVerificationExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (userWithOtp.emailVerificationExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const hashedInput = crypto.createHash("sha256").update(String(otp)).digest("hex");

    if (hashedInput !== userWithOtp.emailVerificationOtp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    userWithOtp.isEmailVerified = true;
    userWithOtp.emailVerificationOtp = null;
    userWithOtp.emailVerificationExpires = null;
    await userWithOtp.save();

    return res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to verify email", error: error.message });
  }
}

async function resendVerification(req, res) {
  try {
    if (req.user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    if (!req.user.email) {
      return res.status(400).json({ message: "No email address on this account" });
    }

    const userWithOtp = await User.findById(req.user._id)
      .select("+emailVerificationOtp +emailVerificationExpires");

    if (!userWithOtp) {
      return res.status(404).json({ message: "User not found" });
    }

    // Enforce 5-minute cooldown
    if (
      userWithOtp.emailVerificationExpires &&
      userWithOtp.emailVerificationExpires > new Date(Date.now() + OTP_EXPIRY_MS - RESEND_COOLDOWN_MS)
    ) {
      return res.status(429).json({
        message: "Please wait a few minutes before requesting another OTP",
      });
    }

    const { otp, hashedOtp } = generateOtp();
    userWithOtp.emailVerificationOtp = hashedOtp;
    userWithOtp.emailVerificationExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    await userWithOtp.save();

    await sendOtpEmail(req.user.email, otp);

    return res.status(200).json({ message: "OTP sent. Please check your email." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to send OTP", error: error.message });
  }
}

module.exports = {
  register,
  login,
  me,
  verifyEmail,
  resendVerification,
};
