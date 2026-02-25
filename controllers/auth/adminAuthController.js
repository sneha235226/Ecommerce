const bcrypt = require("bcryptjs");
const Admin = require("../../models/Admin");
const User = require("../../models/User");
const { generateAuthToken } = require("../../utils/token");

function buildAdminResponse(admin) {
  return {
    id: admin._id,
    email: admin.email,
    phone: admin.phone,
    role: admin.role,
  };
}

async function login(req, res) {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        message: "Provide email or phone and password",
      });
    }

    const identifiers = [];
    if (email) identifiers.push({ email });
    if (phone) identifiers.push({ phone });

    const admin = await Admin.findOne({ $or: identifiers });

    if (!admin) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        message: "Admin account disabled",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = generateAuthToken(admin, "admin");

    return res.status(200).json({
      message: "Admin login successful",
      token,
      admin: buildAdminResponse(admin),
    });

  } catch (error) {
    return res.status(500).json({
      message: "Unable to login admin",
      error: error.message,
    });
  }
}

async function register(req, res) {
  try {
    const { firstName, lastName, email, phone, password, role, permissions } = req.body;

    if (!email || !phone || !password) {
      return res.status(400).json({ message: "email, phone and password are required" });
    }

    const identifiers = [{ email }, { phone }];
    const existingAdmin = await Admin.findOne({ $or: identifiers });
    const existingUser = await User.findOne({ $or: identifiers });
    if (existingAdmin || existingUser) {
      return res.status(409).json({ message: "Email or phone already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const validRoles = ["admin", "super_admin"];

    const admin = await Admin.create({
      firstName: firstName || "",
      lastName: lastName || "",
      email,
      phone,
      passwordHash,
      role: validRoles.includes(role) ? role : "admin",
      permissions: Array.isArray(permissions) ? permissions : [],
    });

    return res.status(201).json({
      message: "Admin registration successful",
      admin: buildAdminResponse(admin),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Email or phone already in use" });
    }
    return res.status(500).json({ message: "Unable to register admin", error: error.message });
  }
}

function me(req, res) {
  return res.status(200).json({ admin: buildAdminResponse(req.user) });
}

module.exports = {
  register,
  login,
  me,
};
