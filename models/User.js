const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    line1: { type: String, trim: true, required: true },
    line2: { type: String, trim: true, default: "" },
    landmark: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, required: true },
    state: { type: String, trim: true, required: true },
    postalCode: { type: String, trim: true, required: true },
    country: { type: String, trim: true, default: "India" },
    label: { type: String, enum: ["home", "work", "other"], default: "home" },
    isDefault: { type: Boolean, default: false },
    addressType: { type: String, enum: ["shipping", "billing", "both"], default: "both" },
  },
  { _id: true }
);

const savedPaymentMethodSchema = new mongoose.Schema(
  {
    provider: { type: String, trim: true, required: true },
    type: { type: String, enum: ["upi", "card", "netbanking", "wallet"], required: true },
    upiId: { type: String, trim: true, default: "" },
    cardLast4: { type: String, trim: true, default: "" },
    cardNetwork: { type: String, trim: true, default: "" },
    holderName: { type: String, trim: true, default: "" },
    expiryMonth: { type: Number, min: 1, max: 12, default: null },
    expiryYear: { type: Number, min: 2000, default: null },
    tokenRef: { type: String, trim: true, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, default: "" },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: "prefer_not_to_say",
    },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["customer", "seller", "admin"], default: "customer" },
    loginMethods: {
      type: [
        {
          type: String,
          enum: ["password", "email_otp", "phone_otp", "google", "apple"],
        },
      ],
      default: ["password"],
    },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    addresses: { type: [addressSchema], default: [] },
    savedPaymentMethods: { type: [savedPaymentMethodSchema], default: [] },
    lastLoginAt: { type: Date },
    emailVerificationOtp: { type: String, default: null, select: false },
    emailVerificationExpires: { type: Date, default: null, select: false },
    phoneVerificationOtp: { type: String, default: null, select: false },
    phoneVerificationExpires: { type: Date, default: null, select: false },
    passwordResetOtp: { type: String, default: null, select: false },
    passwordResetOtpExpires: { type: Date, default: null, select: false },
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true, collection: "users" }
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ isBlocked: 1, isActive: 1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
