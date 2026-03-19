const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../../models/User");
const Admin = require("../../models/Admin");
const { generateAuthToken } = require("../../utils/token");
const { sendOtpEmail } = require("../../utils/mailer");
const { sendOtpSms } = require("../../utils/sms");

const OTP_EXPIRY_MS = 10 * 60 * 1000;


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
    phoneVerified: user.isPhoneVerified,
    emailVerified: user.isEmailVerified,
    isBlocked: user.isBlocked || false,
    role
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

    const user = await User.create({
      firstName,
      lastName,
      gender,
      email,
      phone,
      passwordHash,
      role,
    });

    return res.status(201).json({
      message: "Registration successful",
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

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked due to suspicious reports. Please contact support.", isBlocked: true });
      }
      return res.status(401).json({ message: "Account is inactive. Please contact admin for more information or create new account" });
    }

    const needsEmailVerify = user.isEmailVerified === false && !!user.email
    const needsPhoneVerify = user.isPhoneVerified === false && !!user.phone
    if (needsEmailVerify || needsPhoneVerify) {
      return res.status(403).json({
        message: "Account not verified. Please verify your email and phone.",
        userId: user._id,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      })
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

/**
 * Send OTP to user's email address
 * Used for email verification, password reset, and other verification flows
 */
async function sendEmailOtp(req, res) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Find user by userId
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(400).json({ message: "User does not have an email address" });
    }

    // Generate OTP
    const { otp, hashedOtp } = generateOtp();

    // Update user with OTP
    await User.findByIdAndUpdate(user._id, {
      emailVerificationOtp: hashedOtp,
      emailVerificationExpires: new Date(Date.now() + OTP_EXPIRY_MS),
    });

    // Send OTP via email
    try {
      await sendOtpEmail(user.email, otp);
    } catch (emailErr) {
      console.error("OTP email failed:", emailErr.message);
      return res.status(500).json({
        message: "Failed to send OTP. Please try again later.",
        error: emailErr.message,
      });
    }

    return res.status(200).json({
      message: "OTP has been sent to your email. It is valid for 10 minutes.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to send OTP", error: error.message });
  }
}

async function verifyEmail(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    // Find user by userId
    const userWithOtp = await User.findById(userId)
      .select("+emailVerificationOtp +emailVerificationExpires");

    if (!userWithOtp) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userWithOtp.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
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

/**
 * Send OTP to user's phone number via SMS
 * Used for phone verification
 */
async function sendSmsOtp(req, res) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Find user by userId
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.phone) {
      return res.status(400).json({ message: "User does not have a phone number" });
    }

    // Generate OTP
    const { otp, hashedOtp } = generateOtp();

    // Update user with OTP
    await User.findByIdAndUpdate(user._id, {
      phoneVerificationOtp: hashedOtp,
      phoneVerificationExpires: new Date(Date.now() + OTP_EXPIRY_MS),
    });

    // Send OTP via SMS
    try {
      await sendOtpSms({ phone: user.phone, otp });
    } catch (smsErr) {
      console.error("OTP SMS failed:", smsErr.message);
      return res.status(500).json({
        message: "Failed to send OTP. Please try again later.",
        error: smsErr.message,
      });
    }

    return res.status(200).json({
      message: "OTP has been sent to your phone. It is valid for 10 minutes.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to send SMS OTP", error: error.message });
  }
}

/**
 * Verify phone number using OTP received via SMS
 * Accepts userId and OTP in request body
 */
async function verifySmsOtp(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    // Find user by userId
    const userWithOtp = await User.findById(userId)
      .select("+phoneVerificationOtp +phoneVerificationExpires");

    if (!userWithOtp) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userWithOtp.isPhoneVerified) {
      return res.status(400).json({ message: "Phone is already verified" });
    }

    if (!userWithOtp.phoneVerificationOtp || !userWithOtp.phoneVerificationExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (userWithOtp.phoneVerificationExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const hashedInput = crypto.createHash("sha256").update(String(otp)).digest("hex");

    if (hashedInput !== userWithOtp.phoneVerificationOtp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    userWithOtp.isPhoneVerified = true;
    userWithOtp.phoneVerificationOtp = null;
    userWithOtp.phoneVerificationExpires = null;
    await userWithOtp.save();

    return res.status(200).json({ message: "Phone verified successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to verify phone", error: error.message });
  }
}



// Login with Email & OTP (step 1: send OTP, step 2: verify and login)
async function loginWithEmailOtp(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const user = await User.findOne({ email }).select("+emailVerificationOtp +emailVerificationExpires");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (user.isActive === false) {
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked due to suspicious reports. Please contact support.", isBlocked: true });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const needsPhoneVerify = user.isPhoneVerified === false && !!user.phone
    if (needsPhoneVerify) {
      return res.status(403).json({
        message: "Account not verified. Please verify your email and phone.",
        userId: user._id,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      })
    }
    if (!otp) {
      // Always send OTP and do not login in this step
      const { otp: generatedOtp, hashedOtp } = generateOtp();
      user.emailVerificationOtp = hashedOtp;
      user.emailVerificationExpires = new Date(Date.now() + OTP_EXPIRY_MS);
      await user.save();
      try {
        await sendOtpEmail(user.email, generatedOtp);
      } catch (emailErr) {
        return res.status(500).json({ message: "Failed to send OTP email", error: emailErr.message });
      }
      return res.status(200).json({ message: "OTP sent to your email. Please check your inbox." });
    }
    // Only allow login if OTP is provided and valid
    if (!user.emailVerificationOtp || !user.emailVerificationExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }
    if (user.emailVerificationExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const hashedInput = crypto.createHash("sha256").update(String(otp)).digest("hex");
    if (hashedInput !== user.emailVerificationOtp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }
    user.isEmailVerified = true;
    user.emailVerificationOtp = null;
    user.emailVerificationExpires = null;
    user.lastLoginAt = new Date();
    await user.save();
    const token = generateAuthToken(user, user.role);
    return res.status(200).json({
      message: "Login successful",
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to login with OTP", error: error.message });
  }
}

// Login with Phone & OTP (step 1: send OTP, step 2: verify and login)
async function loginWithPhoneOtp(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }
    const user = await User.findOne({ phone }).select("+phoneVerificationOtp +phoneVerificationExpires");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (user.isActive === false) {
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked due to suspicious reports. Please contact support.", isBlocked: true });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const needsPhoneVerify = user.isPhoneVerified === false && !!user.phone
    if (needsEmailVerify || needsPhoneVerify) {
      return res.status(403).json({
        message: "Account not verified. Please verify your email and phone.",
        userId: user._id,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      })
    }
    if (!otp) {
      // Always send OTP and do not login in this step
      const { otp: generatedOtp, hashedOtp } = generateOtp();
      user.phoneVerificationOtp = hashedOtp;
      user.phoneVerificationExpires = new Date(Date.now() + OTP_EXPIRY_MS);
      await user.save();
      try {
        await sendOtpSms({ phone: user.phone, otp: generatedOtp });
      } catch (smsErr) {
        return res.status(500).json({ message: "Failed to send OTP SMS", error: smsErr.message });
      }
      return res.status(200).json({ message: "OTP sent to your phone. Please check your messages." });
    }
    // Only allow login if OTP is provided and valid
    if (!user.phoneVerificationOtp || !user.phoneVerificationExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }
    if (user.phoneVerificationExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }
    const hashedInput = crypto.createHash("sha256").update(String(otp)).digest("hex");
    if (hashedInput !== user.phoneVerificationOtp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }
    const needsEmailVerify = user.isEmailVerified === false && !!user.email
    user.isPhoneVerified = true;
    user.phoneVerificationOtp = null;
    user.phoneVerificationExpires = null;
    user.lastLoginAt = new Date();
    await user.save();
    const token = generateAuthToken(user, user.role);
    return res.status(200).json({
      message: "Login successful",
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to login with OTP", error: error.message });
  }
}

module.exports = {
  register,
  login,
  sendEmailOtp,
  verifyEmail,
  sendSmsOtp,
  verifySmsOtp,
  loginWithEmailOtp,
  loginWithPhoneOtp,
};
