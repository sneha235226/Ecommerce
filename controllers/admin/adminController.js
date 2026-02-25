const bcrypt = require("bcryptjs");
const Admin = require("../../models/Admin");
const User = require("../../models/User");

function sanitizeAdmin(adminDoc) {
  const admin = adminDoc.toObject ? adminDoc.toObject() : adminDoc;
  delete admin.passwordHash;
  return admin;
}

async function ensureUniqueIdentity({ email, phone, excludeAdminId = null }) {
  const checks = [];
  if (email) checks.push({ email });
  if (phone) checks.push({ phone });
  if (!checks.length) return null;

  const adminQuery = excludeAdminId
    ? { _id: { $ne: excludeAdminId }, $or: checks }
    : { $or: checks };

  const existingAdmin = await Admin.findOne(adminQuery);
  if (existingAdmin) return "Admin already exists with email or phone";

  const existingUser = await User.findOne({ $or: checks });
  if (existingUser) return "Email or phone is already in use by a user";

  return null;
}

async function createAdmin(req, res) {
  try {
    const { firstName, lastName, email, phone, password, role, permissions, isActive } = req.body;

    if (!email || !phone || !password) {
      return res.status(400).json({ message: "email, phone and password are required" });
    }

    const duplicateMessage = await ensureUniqueIdentity({ email, phone });
    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await Admin.create({
      firstName: firstName || "",
      lastName: lastName || "",
      email,
      phone,
      passwordHash,
      role,
      permissions: Array.isArray(permissions) ? permissions : [],
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({ message: "Admin created", admin: sanitizeAdmin(admin) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Admin already exists with email or phone" });
    }
    return res.status(500).json({ message: "Unable to create admin", error: error.message });
  }
}

async function getAdmins(req, res) {
  try {
    const admins = await Admin.find().select("-passwordHash").sort({ createdAt: -1 });
    return res.status(200).json({ count: admins.length, admins });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch admins", error: error.message });
  }
}

async function getAdminById(req, res) {
  try {
    const admin = await Admin.findById(req.params.id).select("-passwordHash");
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    return res.status(200).json({ admin });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch admin", error: error.message });
  }
}

async function updateAdmin(req, res) {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, password, role, permissions, isActive } = req.body;

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const candidateEmail = email !== undefined ? email : admin.email;
    const candidatePhone = phone !== undefined ? phone : admin.phone;

    const duplicateMessage = await ensureUniqueIdentity({
      email: candidateEmail,
      phone: candidatePhone,
      excludeAdminId: id,
    });
    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }

    if (firstName !== undefined) admin.firstName = firstName;
    if (lastName !== undefined) admin.lastName = lastName;
    if (email !== undefined) admin.email = email;
    if (phone !== undefined) admin.phone = phone;
    if (role !== undefined) admin.role = role;
    if (permissions !== undefined) admin.permissions = Array.isArray(permissions) ? permissions : admin.permissions;
    if (typeof isActive === "boolean") admin.isActive = isActive;
    if (password) admin.passwordHash = await bcrypt.hash(password, 12);

    await admin.save();

    return res.status(200).json({ message: "Admin updated", admin: sanitizeAdmin(admin) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Admin already exists with email or phone" });
    }
    return res.status(500).json({ message: "Unable to update admin", error: error.message });
  }
}

async function deleteAdmin(req, res) {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    if (!admin.isActive) {
      return res.status(200).json({ message: "Admin already deactivated" });
    }

    admin.isActive = false;
    await admin.save();

    return res.status(200).json({ message: "Admin deactivated", adminId: admin._id });
  } catch (error) {
    return res.status(500).json({ message: "Unable to delete admin", error: error.message });
  }
}

module.exports = {
  createAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};
