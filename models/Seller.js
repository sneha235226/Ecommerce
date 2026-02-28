const mongoose = require("mongoose");

const sellerDocumentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: ["gst_certificate", "pan", "other"],
      required: true,
    },
    url: { type: String, trim: true, required: true },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    remarks: { type: String, trim: true, default: "" },
    verifiedAt: { type: Date, default: null },
  },
  { _id: true }
);

const sellerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    businessName: { type: String, trim: true, required: true },
    legalBusinessName: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, lowercase: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },
    gstNumber: String,
    gstVerified: {
      type: Boolean,
      default: false
    },
    businessAddress: {
      line1: { type: String, trim: true, default: "" },
      line2: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      postalCode: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "India" },
    },
    bankDetails: {
      accountHolderName: { type: String, trim: true, default: "" },
      accountNumber: { type: String, trim: true, default: "" },
      ifsc: { type: String, trim: true, default: "" },
      bankName: { type: String, trim: true, default: "" },
      branchName: { type: String, trim: true, default: "" },
      upiId: { type: String, trim: true, default: "" },
    },
    panVerification: {
      status: { type: String, enum: ["unverified", "pending", "verified", "failed"], default: "unverified" },
    },
    documents: { type: [sellerDocumentSchema], default: [] },
    mode: { type: String, enum: ["retail", "wholesale", "hybrid"], default: "retail", index: true },
    wholesaleCapabilities: {
      moq: { type: Number, min: 1, default: 1 },
      leadTimeDays: { type: Number, min: 0, default: 0 },
      manufacturingCapacityPerMonth: { type: Number, min: 0, default: 0 },
    },
    status: {
      type: String,
      enum: ["pending_approval", "approved", "rejected", "suspended"],
      default: "pending_approval",
      index: true,
    },
    approval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      approvedAt: { type: Date, default: null },
      rejectionReason: { type: String, trim: true, default: "" },
    },
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    escrowBalance: { type: Number, min: 0, default: 0 },
    lastSettlementAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sellerSchema.index({ businessName: "text", legalBusinessName: "text", gstNumber: "text" });

module.exports = mongoose.models.Seller || mongoose.model("Seller", sellerSchema);
