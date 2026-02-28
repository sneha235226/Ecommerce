const Seller = require("../../models/Seller");
const Store = require("../../models/Store");
const User = require("../../models/User");
const Product = require("../../models/Product");
const { verifyPanDetails, generateAadhaarOtp, verifyAadhaarOtp } = require("../../services/sandboxClient");
const Aadhaar = require("../../models/Aadhaar");
const { getobject } = require("../../config/s3");
const axios = require("axios");
const { sendGSTOtp, verifyGSTOtp } = require("../../services/gstService");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_DD_MM_YYYY_REGEX = /^\d{2}-\d{2}-\d{4}$/;
const DATE_DD_SLASH_MM_SLASH_YYYY_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

function isAdmin(user) {
  return user?.constructor?.modelName === "Admin";
}

function isValidAadhaar(aadharCardNumber) {
  return /^[0-9]{12}$/.test(aadharCardNumber);
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

function applySellerUpdate(seller, input) {
  const isApproved = seller.status === "approved";

  const allowedTopLevel = [
    "businessName",
    "legalBusinessName",
    "contactEmail",
    "contactPhone",
    "mode",
  ];

  for (const key of allowedTopLevel) {
    if (input[key] !== undefined) {
      seller[key] = input[key];
    }
  }

  if (!isApproved) {
    if (input.gstNumber !== undefined) {
      seller.gstNumber = input.gstNumber;
    }
    if (input.panDetails && typeof input.panDetails === "object") {
      seller.panDetails = {
        ...seller.panDetails,
        ...input.panDetails,
      };
    }

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

  if (seller.panDetails?.panNumber) {
    seller.panDetails.panNumber =
      String(seller.panDetails.panNumber)
        .trim()
        .toUpperCase();
  }
}

// Update pan and gst only until seller is not approved. After approval, only allow update of businessName, legalBusinessName, contactEmail, contactPhone, and mode.
async function updateSeller(req, res) {
  try {
    const seller = await Seller.findOne({
      user: req.user._id
    });

    if (!seller) {
      return res.status(404).json({
        message: "Seller profile not found"
      });
    }

    applySellerUpdate(seller, req.body || {});
    await seller.save();
    return res.status(200).json({
      message: "Seller updated successfully",
      seller
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update seller",
      error: error.message
    });
  }
}

async function createSeller(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const existingSeller = await Seller.findOne({
      user: userId
    });
    if (existingSeller) {
      return res.status(409).json({
        message: "Seller profile already exists"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const payload = {
      user: userId,
      businessName:
        req.body.businessName ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        "New Seller",
      legalBusinessName: req.body.legalBusinessName || "",
      contactEmail:
        req.body.contactEmail || user.email || "",
      contactPhone:
        req.body.contactPhone || user.phone || "",
      gstNumber:
        req.body.gstNumber || "",
      panDetails: {
        panNumber:
          req.body?.panDetails?.panNumber || "",
        nameAsPerPan:
          req.body?.panDetails?.nameAsPerPan || "",
        dateOfIncorporation:
          req.body?.panDetails?.dateOfIncorporation || "",
      },

      mode:
        req.body.mode || "retail",
      businessAddress:
        req.body.businessAddress || {},
      bankDetails:
        req.body.bankDetails || {},
      wholesaleCapabilities:
        req.body.wholesaleCapabilities || {},
    };

    if (payload.panDetails.panNumber) {
      payload.panDetails.panNumber =
        String(payload.panDetails.panNumber)
          .trim()
          .toUpperCase();
    }

    const seller = await Seller.create(payload);
    return res.status(201).json({
      message: "Seller profile created successfully",
      seller
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create seller",
      error: error.message
    });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    let query = {};

    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { legalBusinessName: { $regex: search, $options: "i" } },
        { contactEmail: { $regex: search, $options: "i" } },
        { contactPhone: { $regex: search, $options: "i" } }
      ];
    }

    const [sellers, total] = await Promise.all([
      Seller.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Seller.countDocuments(query)
    ]);

    return res.status(200).json({
      page,
      limit,
      totalSellers: total,
      totalPages: Math.ceil(total / limit),
      sellers
    });

  } catch (error) {
    return res.status(500).json({
      message: "Unable to list sellers",
      error: error.message
    });
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

    const store = await Store.findOne({ seller: seller._id });
    if (store) {
      store.isActive = false;
      await store.save();
    }

    const products = await Product.find({ seller: seller._id });
    if (products) {
      products.forEach(product => {
        product.isActive = false;
        product.save();
      });
    }

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

async function sendOtpGst(req, res) {
  try {
    const { gstNumber } = req.body;
    const response = await sendGSTOtp(gstNumber);

    if (!response) {
      return res.status(400).json({
        message: "Failed to send OTP"
      });
    }

    return res.status(200).json(response);

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
}

async function verifyOtpGst(req, res) {
  try {
    const { gstNumber, otp } = req.body;
    const response = await verifyGSTOtp(gstNumber, otp);

    if (!response) {
      return res.status(400).json({
        message: "OTP verification failed"
      });
    }

    await Seller.findOneAndUpdate(
      { user: req.user._id },
      { gstVerified: true }
    );
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
}

async function sendAadhaarOtp(req, res) {
  try {
    const { consent = "Y", userId, aadharCardNumber } = req.body || {};
    const reason = "KYC_Verification";

    if (!userId) {
      return res.status(400).json({
        ok: false,
        message: "userId is required"
      });
    }

    const user = await User.findById(userId).select("_id");
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }

    if (!isValidAadhaar(aadharCardNumber)) {
      return res.status(400).json({
        ok: false,
        message: "aadharCardNumber must be 12 digits"
      });
    }

    const result = await generateAadhaarOtp({ aadhaarNumber: aadharCardNumber, reason, consent });
    return res.status(result.status || 200).json(result.data);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

async function verifyOtpAadhar(req, res) {
  try {
    const { reference_id, otp, userId, aadharCardNumber } = req.body || {};

    if (!reference_id) {
      return res.status(400).json({
        ok: false,
        message: "reference_id is required"
      });
    }

    if (!otp) {
      return res.status(400).json({
        ok: false,
        message: "otp is required"
      });
    }

    if (!userId) {
      return res.status(400).json({
        ok: false,
        message: "userId is required"
      });
    }

    if (!aadharCardNumber || !isValidAadhaar(aadharCardNumber)) {
      return res.status(400).json({
        ok: false,
        message: "aadharCardNumber must be 12 digits"
      });
    }

    const result = await verifyAadhaarOtp({ reference_id, otp });

    const status = String(result?.data?.data?.status || "").toUpperCase();
    const isValid = status === "VALID";

    const user = await User.findById(userId).select(
      "firstName lastName dob phoneNumber gender"
    );

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }

    const aadhaar = await Aadhaar.findOneAndUpdate(
      { userId },
      {
        $set: {
          aadharCardNumber,
          isAadharVerifed: isValid,
          aadhaarKycResponse: result.data
        }
      },
      { new: true, upsert: true }
    );

    await User.findByIdAndUpdate(userId, { isAadhaarVerifed: isValid });

    const response = {
      ...result.data,
      user,
      aadhaar
    };
    return res.status(result.status || 200).json(response);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

async function getAadhaarById(req, res) {
  try {
    const { id } = req.params;
    const aadhaar = await Aadhaar.findById(id);

    if (!aadhaar) {
      return res.status(404).json({
        ok: false,
        message: "Aadhaar not found"
      });
    }

    let downloadUrl = null;
    if (aadhaar.aadhaarUploadKey) {
      downloadUrl = await getobject(aadhaar.aadhaarUploadKey);
    }

    return res.status(200).json({
      ok: true,
      data: {
        ...aadhaar.toObject(),
        downloadUrl
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
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
  sendAadhaarOtp,
  verifyOtpAadhar,
  getAadhaarById,
  sendOtpGst,
  verifyOtpGst
};
