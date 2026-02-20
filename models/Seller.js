const mongoose = require("mongoose");

const sellerDocumentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: ["gst_certificate", "tax_id", "pan", "bank_proof", "business_license", "other"],
      required: true,
    },
    url: { type: String, trim: true, required: true },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    remarks: { type: String, trim: true, default: "" },
    verifiedAt: { type: Date, default: null },
  },
  { _id: true }
);

const commissionOverrideSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    retailCommissionPercent: { type: Number, min: 0, max: 100, default: null },
    wholesaleCommissionPercent: { type: Number, min: 0, max: 100, default: null },
    hybridCommissionPercent: { type: Number, min: 0, max: 100, default: null },
  },
  { _id: false }
);

const sellerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    businessName: { type: String, trim: true, required: true },
    legalBusinessName: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, lowercase: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    taxId: { type: String, trim: true, default: "" },
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
    isApproved: { type: Boolean, default: false },
    approval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      approvedAt: { type: Date, default: null },
      rejectionReason: { type: String, trim: true, default: "" },
    },
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    commission: {
      retailCommissionPercent: { type: Number, min: 0, max: 100, default: 12 },
      wholesaleCommissionPercent: { type: Number, min: 0, max: 100, default: 5 },
      hybridCommissionPercent: { type: Number, min: 0, max: 100, default: 8 },
      categoryOverrides: { type: [commissionOverrideSchema], default: [] },
    },
    escrowBalance: { type: Number, min: 0, default: 0 },
    lastSettlementAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sellerSchema.index({ businessName: "text", legalBusinessName: "text", gstNumber: "text" });

module.exports = mongoose.models.Seller || mongoose.model("Seller", sellerSchema);
