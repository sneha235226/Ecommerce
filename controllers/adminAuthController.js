const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const { generateAuthToken } = require("../utils/token");

function buildAdminResponse(admin) {
  return {
    id: admin._id,
    email: admin.email,
    phone: admin.phone,
    role: "admin",
  };
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

    const admin = await Admin.findOne({ $or: identifiers });

    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateAuthToken(admin, "admin");

    return res.status(200).json({
      message: "Admin login successful",
      token,
      admin: buildAdminResponse(admin),
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to login admin", error: error.message });
  }
}

function me(req, res) {
  return res.status(200).json({ admin: buildAdminResponse(req.user) });
}

module.exports = {
  login,
  me,
};
