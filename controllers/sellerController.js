const Seller = require("../models/Seller");
const User = require("../models/User");
const { verifyPanDetails } = require("../services/sandboxClient");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_DD_MM_YYYY_REGEX = /^\d{2}-\d{2}-\d{4}$/;
const DATE_DD_SLASH_MM_SLASH_YYYY_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

function isAdmin(user) {
  return user?.role === "admin" || user?.constructor?.modelName === "Admin";
}

function buildDateCandidates(input) {
  const value = String(input || "").trim();
  if (!value) return [""];

  if (DATE_YYYY_MM_DD_REGEX.test(value)) {
    const [yyyy, mm, dd] = value.split("-");
    return [value, `${dd}-${mm}-${yyyy}`, `${dd}/${mm}/${yyyy}`];
  }

  if (DATE_DD_SLASH_MM_SLASH_YYYY_REGEX.test(value)) {
    const [dd, mm, yyyy] = value.split("/");
    return [value, `${dd}-${mm}-${yyyy}`, `${yyyy}-${mm}-${dd}`];
  }

  if (DATE_DD_MM_YYYY_REGEX.test(value)) {
    const [dd, mm, yyyy] = value.split("-");
    return [value, `${yyyy}-${mm}-${dd}`, `${dd}/${mm}/${yyyy}`];
  }

  return null;
}

function looksPanVerified(providerData) {
  const statusRaw = providerData?.pan_status || providerData?.status || providerData?.verification_status;
  const status = String(statusRaw || "").toLowerCase();
  if (providerData?.valid === true || providerData?.is_valid === true || providerData?.verified === true) {
    return true;
  }
  return ["valid", "verified", "success", "active"].includes(status);
}

function canAccessSeller(reqUser, sellerDoc) {
  if (isAdmin(reqUser)) return true;
  return String(sellerDoc.user) === String(reqUser?._id);
}

function applySellerUpdate(seller, input, { admin }) {
  const allowedTopLevel = [
    "businessName",
    "legalBusinessName",
    "contactEmail",
    "contactPhone",
    "gstNumber",
    "mode",
  ];

  for (const key of allowedTopLevel) {
    if (input[key] !== undefined) {
      seller[key] = input[key];
    }
  }

  if (input.panDetails && typeof input.panDetails === "object") {
    seller.panDetails = {
      ...seller.panDetails,
      ...input.panDetails,
    };
  }

  if (input.businessAddress && typeof input.businessAddress === "object") {
    seller.businessAddress = {
      ...seller.businessAddress,
      ...input.businessAddress,
    };
  }

  if (input.bankDetails && typeof input.bankDetails === "object") {
    seller.bankDetails = {
      ...seller.bankDetails,
      ...input.bankDetails,
    };
  }

  if (input.wholesaleCapabilities && typeof input.wholesaleCapabilities === "object") {
    seller.wholesaleCapabilities = {
      ...seller.wholesaleCapabilities,
      ...input.wholesaleCapabilities,
    };
  }

  if (admin) {
    if (input.status !== undefined) seller.status = input.status;
    if (input.approval && typeof input.approval === "object") {
      seller.approval = {
        ...seller.approval,
        ...input.approval,
      };
    }
  }

  if (seller.panDetails?.panNumber) {
    seller.panDetails.panNumber = String(seller.panDetails.panNumber).trim().toUpperCase();
  }
}

async function createSeller(req, res) {
  try {
    const admin = isAdmin(req.user);
    const targetUserId = req.body.userId || req.user?._id;

    if (!targetUserId) {
      return res.status(400).json({ message: "userId is required" });
    }

    if (!admin && String(targetUserId) !== String(req.user?._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const existingSeller = await Seller.findOne({ user: targetUserId });
    if (existingSeller) {
      return res.status(409).json({ message: "Seller profile already exists for this user" });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const payload = {
      user: targetUserId,
      businessName:
        req.body.businessName ||
        (user.firstName ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`.trim() : "New Seller"),
      legalBusinessName: req.body.legalBusinessName || "",
      contactEmail: req.body.contactEmail || user.email || "",
      contactPhone: req.body.contactPhone || user.phone || "",
      gstNumber: req.body.gstNumber || "",
      panDetails: {
        panNumber: req.body?.panDetails?.panNumber || "",
        nameAsPerPan: req.body?.panDetails?.nameAsPerPan || "",
        dateOfIncorporation: req.body?.panDetails?.dateOfIncorporation || "",
      },
      mode: req.body.mode || "retail",
      businessAddress: req.body.businessAddress || {},
      bankDetails: req.body.bankDetails || {},
      wholesaleCapabilities: req.body.wholesaleCapabilities || {},
    };

    if (admin && req.body.status) {
      payload.status = req.body.status;
    }

    if (payload.panDetails.panNumber) {
      payload.panDetails.panNumber = String(payload.panDetails.panNumber).trim().toUpperCase();
    }

    const seller = await Seller.create(payload);

    if (user.role !== "seller") {
      user.role = "seller";
      await user.save();
    }

    return res.status(201).json({ message: "Seller created", seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create seller", error: error.message });
  }
}

async function getMySellerProfile(req, res) {
  try {
    const seller = await Seller.findOne({ user: req.user?._id });
    if (!seller) {
      return res.status(404).json({ message: "Seller profile not found" });
    }
    return res.status(200).json({ seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch seller profile", error: error.message });
  }
}

async function listSellers(req, res) {
  try {
    if (!isAdmin(req.user)) {
      const seller = await Seller.findOne({ user: req.user?._id });
      if (!seller) {
        return res.status(200).json({ count: 0, sellers: [] });
      }
      return res.status(200).json({ count: 1, sellers: [seller] });
    }

    const sellers = await Seller.find().sort({ createdAt: -1 });
    return res.status(200).json({ count: sellers.length, sellers });
  } catch (error) {
    return res.status(500).json({ message: "Unable to list sellers", error: error.message });
  }
}

async function getSellerById(req, res) {
  try {
    const { id } = req.params;
    const seller = await Seller.findById(id);

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!canAccessSeller(req.user, seller)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({ seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch seller", error: error.message });
  }
}

async function updateSeller(req, res) {
  try {
    const { id } = req.params;
    const seller = await Seller.findById(id);

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!canAccessSeller(req.user, seller)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    applySellerUpdate(seller, req.body || {}, { admin: isAdmin(req.user) });
    await seller.save();

    return res.status(200).json({ message: "Seller updated", seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update seller", error: error.message });
  }
}

async function deleteSeller(req, res) {
  try {
    const { id } = req.params;
    const seller = await Seller.findById(id);

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!canAccessSeller(req.user, seller)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    seller.status = "suspended";
    await seller.save();

    return res.status(200).json({ message: "Seller deactivated", sellerId: seller._id });
  } catch (error) {
    return res.status(500).json({ message: "Unable to delete seller", error: error.message });
  }
}

async function verifySellerBusinessPan(req, res) {
  try {
    const {
      userId,
      consent = "Y",
      reason = "Seller PAN verification for marketplace onboarding",
      acceptCache,
    } = req.body;

    const authenticatedUserId = req.user?._id;
    if (!authenticatedUserId) {
      return res.status(401).json({ message: "Unauthorized: seller token required" });
    }

    if (userId && String(userId) !== String(authenticatedUserId)) {
      return res.status(403).json({
        message: "Forbidden: you can verify PAN only for your own seller account",
      });
    }

    const targetUserId = userId || authenticatedUserId;
    const seller = await Seller.findOne({ user: targetUserId });
    if (!seller) {
      return res.status(404).json({ message: "Seller profile not found for this user" });
    }

    const sourcePan = String(seller.panDetails?.panNumber || "").trim().toUpperCase();
    const panName = String(seller.panDetails?.nameAsPerPan || "").trim();
    const incorporationDateInput = String(seller.panDetails?.dateOfIncorporation || "").trim();
    const panDobCandidates = buildDateCandidates(incorporationDateInput);

    if (!PAN_REGEX.test(sourcePan)) {
      return res.status(400).json({
        message: "Valid PAN is required in seller.panDetails.panNumber",
      });
    }

    if (!panName) {
      return res.status(400).json({
        message: "name_as_per_pan is required",
      });
    }

    if (!incorporationDateInput) {
      return res.status(400).json({
        message: "date_of_incorporation is required",
      });
    }

    if (panDobCandidates === null) {
      return res.status(400).json({
        message: "date_of_incorporation format is invalid. Use YYYY-MM-DD or DD-MM-YYYY",
      });
    }

    let verificationResult = null;
    for (const candidateDob of panDobCandidates) {
      verificationResult = await verifyPanDetails({
        pan: sourcePan,
        nameAsPerPan: panName,
        dateOfBirth: candidateDob || undefined,
        consent,
        reason,
        acceptCache,
      });

      const providerMessage = String(verificationResult?.data?.message || "").toLowerCase();
      const invalidDobFormat =
        Number(verificationResult?.status) === 422
        && providerMessage.includes("date_of_birth")
        && providerMessage.includes("format");

      if (!invalidDobFormat) {
        break;
      }
    }

    const providerData = verificationResult?.data?.data || verificationResult?.data || {};
    const verified = verificationResult?.status >= 200
      && verificationResult?.status < 300
      && looksPanVerified(providerData);

    seller.panVerification = {
      status: verified ? "verified" : "failed",
    };

    await seller.save();

    return res.status(200).json({
      message: verified ? "PAN verified successfully" : "PAN verification completed but not verified",
      verified,
      sellerId: seller._id,
      panDetails: seller.panDetails,
      panVerification: seller.panVerification,
      providerStatusCode: verificationResult?.status,
      providerResponse: verificationResult?.data,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to verify seller PAN", error: error.message });
  }
}

module.exports = {
  createSeller,
  listSellers,
  getMySellerProfile,
  getSellerById,
  updateSeller,
  deleteSeller,
  verifySellerBusinessPan,
};
