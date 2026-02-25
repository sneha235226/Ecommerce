const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      default: ""
    },
    lastName: {
      type: String,
      trim: true,
      default: ""
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
      index: true
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      required: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["super_admin", "admin"],
      default: "admin"
    },
    permissions: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    collection: "admins"
  }
);

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);