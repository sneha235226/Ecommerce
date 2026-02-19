const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Admin = require("../models/Admin");
const ALLOWED_ROLES = new Set(["customer", "seller"]);
const ALLOWED_SELLER_TYPES = new Set(["B2C", "B2B", "both"]);

function sanitizeUser(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;
  delete user.passwordHash;
  return user;
}

function isAdmin(user) {
  return user?.role === "admin" || user?.constructor?.modelName === "Admin";
}

function isSelf(user, userId) {
  return user?._id?.toString() === userId;
}

async function createUser(req, res) {
  try {
    const { firstName, lastName, gender, email, phone, password, role, sellerType } = req.body;

    if (!firstName || !password) {
      return res.status(400).json({ message: "firstName and password are required" });
    }

    if (!email && !phone) {
      return res.status(400).json({ message: "Provide at least email or phone" });
    }

    const identifiers = [];
    if (email) identifiers.push({ email });
    if (phone) identifiers.push({ phone });

    const existingUser = await User.findOne({ $or: identifiers });
    const existingAdmin = await Admin.findOne({ $or: identifiers });
    const existing = existingUser || existingAdmin;
    if (existing) {
      return res.status(409).json({ message: "User already exists with email or phone" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const safeRole = ALLOWED_ROLES.has(role) ? role : "customer";

    if (safeRole === "seller" && sellerType && !ALLOWED_SELLER_TYPES.has(sellerType)) {
      return res.status(400).json({ message: "Invalid sellerType. Must be B2C, B2B, or both" });
    }
    const safeSellerType = safeRole === "seller"
      ? (ALLOWED_SELLER_TYPES.has(sellerType) ? sellerType : "B2C")
      : null;

    const user = await User.create({
      firstName,
      lastName,
      gender,
      email,
      phone,
      passwordHash,
      role: safeRole,
      sellerType: safeSellerType,
    });

    return res.status(201).json({ message: "User created", user: sanitizeUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "User already exists with email or phone" });
    }
    return res.status(500).json({ message: "Unable to create user", error: error.message });
  }
}

async function getUsers(req, res) {
  try {
    const users = await User.find().select("-passwordHash").sort({ createdAt: -1 });
    return res.status(200).json({ count: users.length, users });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch users", error: error.message });
  }
}

async function getUserById(req, res) {
  try {
    const { id } = req.params;

    if (!isAdmin(req.user) && !isSelf(req.user, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await User.findById(id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch user", error: error.message });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;

    if (!isAdmin(req.user) && !isSelf(req.user, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { firstName, lastName, gender, email, phone, password, isActive, role, sellerType } = req.body;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const sourceRole = user.role;

    if ((email && email !== user.email) || (phone && phone !== user.phone)) {
      const duplicateChecks = [];
      if (email && email !== user.email) duplicateChecks.push({ email });
      if (phone && phone !== user.phone) duplicateChecks.push({ phone });

      const duplicateUser = await User.findOne({ _id: { $ne: id }, $or: duplicateChecks });
      const duplicateAdmin = await Admin.findOne({ $or: duplicateChecks });
      const duplicate = duplicateUser || duplicateAdmin;
      if (duplicate) {
        return res.status(409).json({ message: "Email or phone is already in use" });
      }
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (gender !== undefined) user.gender = gender;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;

    if (password) {
      user.passwordHash = await bcrypt.hash(password, 12);
    }

    let targetRole = sourceRole;

    if (isAdmin(req.user)) {
      if (isActive !== undefined) {
        user.isActive = isActive;
        user.deletedAt = isActive ? null : user.deletedAt || new Date();
      }

      if (role !== undefined && role !== sourceRole) {
        if (!ALLOWED_ROLES.has(role)) {
          return res.status(400).json({ message: "Invalid role value" });
        }
        targetRole = role;
      }

      if (sellerType !== undefined) {
        const effectiveRole = targetRole;
        if (effectiveRole !== "seller") {
          return res.status(400).json({ message: "sellerType is only applicable to sellers" });
        }
        if (!ALLOWED_SELLER_TYPES.has(sellerType)) {
          return res.status(400).json({ message: "Invalid sellerType. Must be B2C, B2B, or both" });
        }
        user.sellerType = sellerType;
      }
    } else {
      // Non-admin (self-update): can change own sellerType if already a seller
      if (sellerType !== undefined) {
        if (user.role !== "seller") {
          return res.status(403).json({ message: "sellerType can only be set for sellers" });
        }
        if (!ALLOWED_SELLER_TYPES.has(sellerType)) {
          return res.status(400).json({ message: "Invalid sellerType. Must be B2C, B2B, or both" });
        }
        user.sellerType = sellerType;
      }
    }

    if (targetRole !== sourceRole) {
      user.role = targetRole;
      const updatedUser = await user.save();
      return res.status(200).json({ message: "User updated", user: sanitizeUser(updatedUser) });
    }

    await user.save();

    return res.status(200).json({ message: "User updated", user: sanitizeUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Email or phone is already in use" });
    }
    return res.status(500).json({ message: "Unable to update user", error: error.message });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (!isAdmin(req.user) && !isSelf(req.user, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isActive && user.deletedAt) {
      return res.status(200).json({ message: "User already deactivated" });
    }

    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();

    return res.status(200).json({ message: "User deactivated (soft deleted)" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to delete user", error: error.message });
  }
}

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
};
