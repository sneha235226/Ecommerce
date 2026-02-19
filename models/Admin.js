const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true, unique: true, required: true },
    phone: { type: String, trim: true, unique: true, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, collection: "admins" }
);

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
