const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, unique: true, required: true },
    phone: { type: String, trim: true, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["super_admin", "operations_admin", "finance_admin"], default: "operations_admin" },
    permissions: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "admins" }
);

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
