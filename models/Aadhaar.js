const mongoose = require("mongoose");

const aadhaarSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      unique: true,
      index: true
    },
    aadharCardNumber: {
      type: String,
      trim: true,
      match: [/^[0-9]{12}$/, "Aadhar must be 12 digits"],
      default: null
    },
    isAadharVerifed: {
      type: Boolean,
      default: false
    },
    aadhaarKycResponse: {
      type: Object,
      default: null
    },
    aadhaarUploadKey: {
      type: String,
      default: null
    },
    format: {
      type: String,
      enum: ["image", "pdf"],
      default: null
    }
  },
  { timestamps: true }
);

aadhaarSchema.index({ aadharCardNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Aadhaar || mongoose.model("Aadhaar", aadhaarSchema);
