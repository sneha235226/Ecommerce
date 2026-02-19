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
    role: { type: String, enum: ["customer", "seller"], default: "customer" },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    addresses: { type: [addressSchema], default: [] },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    lastLoginAt: { type: Date },
    emailVerificationOtp: { type: String, default: null, select: false },
    emailVerificationExpires: { type: Date, default: null, select: false },
    phoneVerificationOtp: { type: String, default: null, select: false },
    phoneVerificationExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true, collection: "users" }
);

userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
