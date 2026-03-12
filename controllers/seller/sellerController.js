const Seller = require("../../models/Seller");
const Store = require("../../models/Store");
const Product = require("../../models/Product");
const { verifyPanDetails, generateAadhaarOtp, verifyAadhaarOtp } = require("../../services/sandboxClient");
const Aadhaar = require("../../models/Aadhaar");
const { getobject } = require("../../config/s3");
const { computeOnboardingCompleted } = require("./onboardingController");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_DD_MM_YYYY_REGEX = /^\d{2}-\d{2}-\d{4}$/;
const DATE_DD_SLASH_MM_SLASH_YYYY_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

function isValidAadhaar(num) {
  return /^[0-9]{12}$/.test(num);
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

// ─── applySellerUpdate ────────────────────────────────────────────────────────
// Applies safe, allowed updates to the seller document.
// Verified fields are locked and cannot be overwritten via this function.

function applySellerUpdate(seller, input) {
  const isApproved = seller.status === "approved";

  // These top-level fields are always editable.
  // businessName is intentionally excluded — it is auto-populated from GST or MSME verification.
  const allowedTopLevel = [
    "legalBusinessName",
    "contactEmail",
    "contactPhone",
    "mode",
    "businessDescription"   // editable during and after onboarding
  ];

  for (const key of allowedTopLevel) {
    if (input[key] !== undefined) {
      seller[key] = input[key];
    }
  }

  // PAN details — locked once panVerified=true or seller is approved
  if (!isApproved && !seller.panVerified) {
    if (input.panDetails && typeof input.panDetails === "object") {
      seller.panDetails = { ...seller.panDetails, ...input.panDetails };
    }
  }

  // Bank details — locked once bankDetails.verified=true
  if (!seller.bankDetails?.verified) {
    if (input.bankDetails && typeof input.bankDetails === "object") {
      // Do not allow overwriting verified/verifiedAt/raw via profile update
      const { verified, verifiedAt, raw, ...safeBank } = input.bankDetails;
      seller.bankDetails = { ...seller.bankDetails, ...safeBank };
    }
  }

  // Business address — locked once GST or MSME has populated it via verification
  if (!seller.gst?.verified && !seller.msme?.verified) {
    if (input.businessAddress && typeof input.businessAddress === "object") {
      seller.businessAddress = { ...seller.businessAddress, ...input.businessAddress };
    }
  }

  // Normalize PAN to uppercase
  if (seller.panDetails?.panNumber) {
    seller.panDetails.panNumber = String(seller.panDetails.panNumber).trim().toUpperCase();
  }
}

// ─── GET /sellers/me ──────────────────────────────────────────────────────────

async function getMySellerProfile(req, res) {
  try {
    return res.status(200).json({ seller: req.seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch seller profile", error: error.message });
  }
}

// ─── DELETE /sellers/delete ───────────────────────────────────────────────────

async function deleteSeller(req, res) {
  try {
    const seller = req.seller;
    seller.status = "suspended";
    seller.isActive = false;
    await Store.updateMany({ seller: seller._id }, { isActive: false });
    await Product.updateMany({ seller: seller._id }, { isActive: false });
    await seller.save();
    return res.status(200).json({ message: "Seller account deactivated", sellerId: seller._id });
  } catch (error) {
    return res.status(500).json({ message: "Unable to deactivate seller", error: error.message });
  }
}

// ─── POST /sellers/verify-pan ─────────────────────────────────────────────────
// Accepts PAN details in the request body, saves them, then verifies via Sandbox.
// Body: { panNumber, nameAsPerPan, dateOfIncorporation, consent?, acceptCache? }

async function verifySellerBusinessPan(req, res) {
  try {
    const {
      panNumber,
      nameAsPerPan,
      dateOfIncorporation,
      consent = "Y",
      reason = "Seller PAN verification for marketplace onboarding",
      acceptCache
    } = req.body;

    const seller = req.seller;

    if (seller.panVerified) {
      return res.status(400).json({ message: "PAN is already verified and cannot be changed" });
    }

    // Accept details from request body; fall back to what's already saved
    const sourcePan = String(panNumber || seller.panDetails?.panNumber || "").trim().toUpperCase();
    const panName = String(nameAsPerPan || seller.panDetails?.nameAsPerPan || "").trim();
    const incorporationDateInput = String(dateOfIncorporation || seller.panDetails?.dateOfIncorporation || "").trim();
    const panDobCandidates = buildDateCandidates(incorporationDateInput);

    if (!PAN_REGEX.test(sourcePan)) {
      return res.status(400).json({ message: "panNumber is required and must be a valid PAN (e.g. ABCDE1234F)" });
    }
    if (!panName) {
      return res.status(400).json({ message: "nameAsPerPan is required" });
    }
    if (!incorporationDateInput) {
      return res.status(400).json({ message: "dateOfIncorporation is required" });
    }
    if (panDobCandidates === null) {
      return res.status(400).json({ message: "dateOfIncorporation format is invalid. Use YYYY-MM-DD or DD-MM-YYYY" });
    }

    // Persist the submitted PAN details before calling the external API
    seller.panDetails = {
      panNumber: sourcePan,
      nameAsPerPan: panName,
      dateOfIncorporation: incorporationDateInput
    };
    await seller.save();

    let verificationResult = null;
    for (const candidateDob of panDobCandidates) {
      verificationResult = await verifyPanDetails({
        pan: sourcePan,
        nameAsPerPan: panName,
        dateOfBirth: candidateDob || undefined,
        consent,
        reason,
        acceptCache
      });

      const providerMessage = String(verificationResult?.data?.message || "").toLowerCase();
      const invalidDobFormat =
        Number(verificationResult?.status) === 422 &&
        providerMessage.includes("date_of_birth") &&
        providerMessage.includes("format");

      if (!invalidDobFormat) break;
    }

    const providerData = verificationResult?.data?.data || verificationResult?.data || {};
    const verified = verificationResult?.status >= 200 &&
      verificationResult?.status < 300 &&
      looksPanVerified(providerData);

    // Update seller — set panVerified flag and recompute onboarding
    seller.panVerification = { status: verified ? "verified" : "failed" };
    if (verified) {
      seller.panVerified = true;
      seller.onboardingCompleted = computeOnboardingCompleted(seller);
    }
    await seller.save();

    return res.status(200).json({
      message: verified ? "PAN verified successfully" : "PAN verification completed but not verified",
      verified,
      sellerId: seller._id,
      panDetails: seller.panDetails,
      panVerification: seller.panVerification,
      onboardingCompleted: seller.onboardingCompleted,
      providerStatusCode: verificationResult?.status,
      providerResponse: verificationResult?.data
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to verify seller PAN", error: error.message });
  }
}

// ─── POST /sellers/aadhaar/send-otp ──────────────────────────────────────────

async function sendAadhaarOtp(req, res) {
  try {
    const { consent = "Y", aadharCardNumber } = req.body || {};
    const reason = "KYC_Verification";

    if (!isValidAadhaar(aadharCardNumber)) {
      return res.status(400).json({ ok: false, message: "aadharCardNumber must be 12 digits" });
    }
    const existingAadhaar = await Aadhaar.findOne({ aadharCardNumber });
    if (existingAadhaar?.isAadharVerifed) {
      return res.status(400).json({ ok: false, message: "This Aadhaar number is already verified" });
    }
    const result = await generateAadhaarOtp({ aadhaarNumber: aadharCardNumber, reason, consent });
    return res.status(result.status || 200).json(result.data);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

// ─── POST /sellers/aadhaar/verify-otp ────────────────────────────────────────
// Verifies Aadhaar OTP via Sandbox.  Sets aadhaarVerified=true on success.

async function verifyOtpAadhar(req, res) {
  try {
    const { reference_id, otp, aadharCardNumber } = req.body || {};
    const seller = req.seller;

    if (!reference_id) return res.status(400).json({ ok: false, message: "reference_id is required" });
    if (!otp) return res.status(400).json({ ok: false, message: "otp is required" });
    if (!aadharCardNumber || !isValidAadhaar(aadharCardNumber)) {
      return res.status(400).json({ ok: false, message: "aadharCardNumber must be 12 digits" });
    }

    const result = await verifyAadhaarOtp({ reference_id, otp });
    const status = String(result?.data?.data?.status || "").toUpperCase();
    const isValid = status === "VALID";

    // Upsert Aadhaar record — filter field matches schema field (sellerId)
    // Mongoose merges the filter into the upserted document automatically
    const aadhaar = await Aadhaar.findOneAndUpdate(
      { sellerId: seller._id },
      {
        $set: {
          aadharCardNumber,
          isAadharVerifed: isValid,
          aadhaarKycResponse: result.data
        }
      },
      { new: true, upsert: true }
    );

    if (isValid) {
      // Update both the legacy typo field and the new clean flag
      const freshSeller = await Seller.findById(seller._id);
      freshSeller.aadhaarVerified = true;
      freshSeller.onboardingCompleted = computeOnboardingCompleted(freshSeller);
      await freshSeller.save();
    }

    return res.status(result.status || 200).json({ ...result.data, aadhaar });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

// ─── GET /sellers/aadhaar/:id ─────────────────────────────────────────────────

async function getAadhaarById(req, res) {
  try {
    const { id } = req.params;
    const aadhaar = await Aadhaar.findById(id);
    if (!aadhaar) {
      return res.status(404).json({ ok: false, message: "Aadhaar not found" });
    }

    let downloadUrl = null;
    if (aadhaar.aadhaarUploadKey) {
      downloadUrl = await getobject(aadhaar.aadhaarUploadKey);
    }

    return res.status(200).json({ ok: true, data: { ...aadhaar.toObject(), downloadUrl } });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

module.exports = {
  getMySellerProfile,
  deleteSeller,
  verifySellerBusinessPan,
  sendAadhaarOtp,
  verifyOtpAadhar,
  getAadhaarById
};
