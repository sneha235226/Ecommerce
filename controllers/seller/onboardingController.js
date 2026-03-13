const Seller = require("../../models/Seller");
const Aadhaar = require("../../models/Aadhaar");
const { verifyBankAccount, verifyGSTIN, verifyMSMEByPan } = require("../../services/idspayService");

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function computeOnboardingCompleted(seller) {
    return !!(
        seller.aadhaarVerified &&
        seller.panVerified &&
        seller.bankDetails?.verified &&
        (seller.gst?.verified || seller.msme?.verified)
    );
}

function maskAccountNumber(num) {
    if (!num) return "";
    const s = String(num);
    return s.length > 4 ? "X".repeat(s.length - 4) + s.slice(-4) : s;
}

function maskAadhaar(num) {
    if (!num) return "";
    const s = String(num);
    return s.length > 4 ? "XXXX-XXXX-" + s.slice(-4) : s;
}

async function getOnboardingStatus(req, res) {
    try {
        const s = req.seller;
        return res.status(200).json({
            onboardingCompleted: s.onboardingCompleted,
            steps: {
                aadhaar: {
                    completed: s.aadhaarVerified,
                    description: "Aadhaar OTP verification"
                },
                pan: {
                    completed: s.panVerified,
                    status: s.panVerification?.status || "unverified",
                    description: "PAN verification"
                },
                bank: {
                    completed: s.bankDetails?.verified || false,
                    verifiedAt: s.bankDetails?.verifiedAt || null,
                    description: "Bank account verification"
                },
                gst: {
                    completed: s.gst?.verified || false,
                    description: "GST verification (optional if MSME done)"
                },
                msme: {
                    completed: s.msme?.verified || false,
                    description: "MSME/Udyam verification (optional if GST done)"
                }
            },
            rule: {
                required: ["aadhaar", "pan", "bank"],
                atLeastOne: ["gst", "msme"],
                satisfied: (s.gst?.verified || s.msme?.verified) || false
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch onboarding status", error: error.message });
    }
}

// Body: { accountNumber, ifsc }
async function verifyBank(req, res) {
    try {
        const seller = req.seller;

        if (seller.bankDetails?.verified) {
            return res.status(400).json({ message: "Bank account is already verified and cannot be changed" });
        }

        const { accountNumber, ifsc } = req.body;
        if (!accountNumber || !ifsc) {
            return res.status(400).json({ message: "accountNumber and ifsc are required" });
        }

        const ifscClean = String(ifsc).trim().toUpperCase();
        const acClean = String(accountNumber).trim();

        const result = await verifyBankAccount(acClean, ifscClean);

        if (!result || result.status < 200 || result.status >= 300) {
            return res.status(400).json({
                message: "Bank verification failed",
                details: result?.data || null
            });
        }

        const payload = result.data?.data || result.data || {};

        // IDSPay Penny Less: success = outer status.code 200 + account_exists true
        const outerStatusCode = result.data?.status?.code;
        const outerStatusType = String(result.data?.status?.type || "").toLowerCase();
        const apiSuccess = outerStatusCode === 200 || outerStatusType === "success";
        const accountExists = payload?.account_exists === true;

        if (!apiSuccess || !accountExists) {
            return res.status(400).json({
                message: "Bank verification failed: account could not be confirmed",
                details: result.data
            });
        }

        const freshSeller = await Seller.findById(seller._id);
        const ifscDetails = payload.ifsc_details || payload.ifscDetails || {};

        freshSeller.bankDetails = {
            accountHolderName: payload.full_name || payload.account_holder_name || payload.beneficiaryName || payload.creditorName || freshSeller.bankDetails?.accountHolderName || "",
            accountNumber:     acClean,
            ifsc:              ifscClean,
            bankName:          ifscDetails.bank_name || ifscDetails.bank || payload.bank_name || payload.bankName || freshSeller.bankDetails?.bankName || "",
            branchName:        ifscDetails.branch    || payload.branch_name || payload.branchName || freshSeller.bankDetails?.branchName || "",
            upiId:             payload.upi_id || freshSeller.bankDetails?.upiId || "",
            verified:          true,
            verifiedAt:        new Date(),
            // raw stored but excluded from normal reads (select: false)
            raw:               result.data
        };

        freshSeller.onboardingCompleted = computeOnboardingCompleted(freshSeller);
        await freshSeller.save();

        return res.status(200).json({
            message: "Bank account verified successfully",
            bankVerified: true,
            bankDetails: {
                accountHolderName: freshSeller.bankDetails.accountHolderName,
                accountNumber: maskAccountNumber(acClean),
                ifsc: freshSeller.bankDetails.ifsc,
                bankName: freshSeller.bankDetails.bankName,
                verifiedAt: freshSeller.bankDetails.verifiedAt
            },
            onboardingCompleted: freshSeller.onboardingCompleted
        });
    } catch (error) {
        return res.status(500).json({ message: "Bank verification failed", error: error.message });
    }
}

// ─── POST /sellers/onboarding/verify-gst ─────────────────────────────────────
// Body: { gstin }
async function verifyGST(req, res) {
    try {
        const seller = req.seller;

        if (seller.gst?.verified) {
            return res.status(400).json({ message: "GST is already verified and cannot be changed" });
        }

        const { gstin } = req.body;
        if (!gstin) {
            return res.status(400).json({ message: "gstin is required" });
        }

        const gstinClean = String(gstin).trim().toUpperCase();
        if (!GSTIN_REGEX.test(gstinClean)) {
            return res.status(400).json({ message: "Invalid GSTIN format" });
        }

        const result = await verifyGSTIN(gstinClean);

        if (!result || result.status < 200 || result.status >= 300) {
            return res.status(400).json({ message: "GST verification failed", details: result?.data });
        }

        // IDSPay GST Srv2: prod returns data.taxpayerDetails object,
        // UAT returns data: [] (empty array). Use inner status.code as success signal.
        const apiSuccess = result.data?.status?.code === 200 ||
            String(result.data?.status?.type || "").toLowerCase() === "success";

        if (!apiSuccess) {
            return res.status(400).json({ message: "GST verification failed", details: result.data });
        }

        const rawData = result.data?.data;
        const inner = (!Array.isArray(rawData) && rawData?.taxpayerDetails)
            || (!Array.isArray(rawData) && rawData)
            || {};

        const pradr = inner.pradr || {};
        const address = pradr.adr || "";
        const city    = pradr.dst || pradr.city || "";
        const state   = pradr.stcd || pradr.state || "";
        const pincode = pradr.pncd || pradr.pincode || "";

        const freshSeller = await Seller.findById(seller._id);

        freshSeller.gst = {
            gstNumber:          gstinClean,
            businessName:       inner.lgnm || inner.tradeNam || "",
            organizationType:   inner.ctb || "",
            address,
            city,
            state,
            pincode,
            businessActivities: Array.isArray(inner.nba) ? inner.nba : [],
            verified:           true,
            verifiedAt:         new Date(),
            raw:                result.data
        };

        // Populate top-level business fields from GST (unless MSME already set them)
        if (!freshSeller.msme?.verified) {
            if (!freshSeller.businessAddress) freshSeller.businessAddress = {};
            if (freshSeller.gst.organizationType) freshSeller.organizationType = freshSeller.gst.organizationType;
            if (freshSeller.gst.businessActivities.length) freshSeller.businessActivities = freshSeller.gst.businessActivities;
            if (freshSeller.gst.businessName && !freshSeller.businessName) freshSeller.businessName = freshSeller.gst.businessName;
            if (freshSeller.gst.city)    freshSeller.businessAddress.city       = freshSeller.gst.city;
            if (freshSeller.gst.state)   freshSeller.businessAddress.state      = freshSeller.gst.state;
            if (freshSeller.gst.pincode) freshSeller.businessAddress.postalCode = freshSeller.gst.pincode;
        }

        freshSeller.onboardingCompleted = computeOnboardingCompleted(freshSeller);
        await freshSeller.save();

        return res.status(200).json({
            message: "GST verified successfully",
            gstVerified: true,
            gst: {
                gstNumber:          freshSeller.gst.gstNumber,
                businessName:       freshSeller.gst.businessName,
                organizationType:   freshSeller.gst.organizationType,
                address:            freshSeller.gst.address,
                city:               freshSeller.gst.city,
                state:              freshSeller.gst.state,
                pincode:            freshSeller.gst.pincode,
                businessActivities: freshSeller.gst.businessActivities,
                verifiedAt:         freshSeller.gst.verifiedAt
            },
            onboardingCompleted: freshSeller.onboardingCompleted
        });
    } catch (error) {
        return res.status(500).json({ message: "GST verification failed", error: error.message });
    }
}

// ─── POST /sellers/onboarding/verify-msme ────────────────────────────────────
// Body: { pan }
async function verifyMSME(req, res) {
    try {
        const seller = req.seller;

        if (seller.msme?.verified) {
            return res.status(400).json({ message: "MSME is already verified and cannot be changed" });
        }

        const { pan } = req.body;
        if (!pan) {
            return res.status(400).json({ message: "pan is required" });
        }

        const panClean = String(pan).trim().toUpperCase();
        if (!PAN_REGEX.test(panClean)) {
            return res.status(400).json({ message: "Invalid PAN format" });
        }

        const result = await verifyMSMEByPan(panClean);

        if (!result || result.status < 200 || result.status >= 300) {
            return res.status(400).json({ message: "MSME verification failed", details: result?.data });
        }

        const enterprise = result.data?.data?.enterprise_data
            || result.data?.data
            || result.data
            || {};

        if (!enterprise.official_name && !enterprise.organization_type) {
            return res.status(400).json({ message: "MSME verification failed: no data returned", details: result.data });
        }

        const addr = enterprise.official_address || {};

        // Build business activities from industry list or major_activity field
        const industryList = result.data?.data?.industry || [];
        const businessActivities = industryList.length
            ? [...new Set(industryList.map(i => i.activity_type).filter(Boolean))]
            : (enterprise.major_activity ? [enterprise.major_activity] : []);

        const freshSeller = await Seller.findById(seller._id);

        freshSeller.msme = {
            udyamNumber:        enterprise.udyam_reg_no || enterprise.udyam_number || "",
            businessName:       enterprise.official_name || "",
            organizationType:   enterprise.organization_type || "",
            address:            [addr.door_no, addr.street, addr.area, addr.city, addr.state].filter(Boolean).join(", "),
            city:               addr.city || addr.district || "",
            state:              addr.state || "",
            pincode:            addr.pincode || "",
            businessActivities,
            verified:           true,
            verifiedAt:         new Date(),
            // raw stored but excluded from normal reads (select: false)
            raw:                result.data
        };

        if (!freshSeller.businessAddress) freshSeller.businessAddress = {};
        if (freshSeller.msme.organizationType) freshSeller.organizationType = freshSeller.msme.organizationType;
        if (freshSeller.msme.businessActivities.length) freshSeller.businessActivities = freshSeller.msme.businessActivities;
        if (freshSeller.msme.businessName && !freshSeller.businessName) freshSeller.businessName = freshSeller.msme.businessName;
        if (freshSeller.msme.city)    freshSeller.businessAddress.city       = freshSeller.msme.city;
        if (freshSeller.msme.state)   freshSeller.businessAddress.state      = freshSeller.msme.state;
        if (freshSeller.msme.pincode) freshSeller.businessAddress.postalCode = freshSeller.msme.pincode;

        freshSeller.onboardingCompleted = computeOnboardingCompleted(freshSeller);
        await freshSeller.save();

        return res.status(200).json({
            message: "MSME verified successfully",
            msmeVerified: true,
            msme: {
                udyamNumber:        freshSeller.msme.udyamNumber,
                businessName:       freshSeller.msme.businessName,
                organizationType:   freshSeller.msme.organizationType,
                address:            freshSeller.msme.address,
                city:               freshSeller.msme.city,
                state:              freshSeller.msme.state,
                pincode:            freshSeller.msme.pincode,
                businessActivities: freshSeller.msme.businessActivities,
                verifiedAt:         freshSeller.msme.verifiedAt
            },
            onboardingCompleted: freshSeller.onboardingCompleted
        });
    } catch (error) {
        return res.status(500).json({ message: "MSME verification failed", error: error.message });
    }
}

// ─── GET /sellers/onboarding/profile-review ──────────────────────────────────

async function getProfileReview(req, res) {
    try {
        const seller = req.seller;
        const aadhaar = await Aadhaar.findOne({ sellerId: seller._id });

        return res.status(200).json({
            onboardingCompleted: seller.onboardingCompleted,
            profileReview: {
                // Basic identity
                identity: {
                    firstName: seller.firstName,
                    lastName: seller.lastName,
                    email: seller.email,
                    phone: seller.phone
                },

                // Aadhaar — verified, read-only
                aadhaar: {
                    verified: seller.aadhaarVerified,
                    maskedAadhaarNumber: aadhaar?.aadharCardNumber
                        ? maskAadhaar(aadhaar.aadharCardNumber)
                        : null,
                    kycStatus: aadhaar?.isAadharVerifed ? "verified" : "unverified"
                },

                // PAN — verified, read-only
                pan: {
                    verified: seller.panVerified,
                    panNumber: seller.panDetails?.panNumber || "",
                    nameAsPerPan: seller.panDetails?.nameAsPerPan || "",
                    verificationStatus: seller.panVerification?.status || "unverified"
                },

                // Bank — verified, read-only
                bank: {
                    verified: seller.bankDetails?.verified || false,
                    accountHolderName: seller.bankDetails?.accountHolderName || "",
                    accountNumber: seller.bankDetails?.accountNumber
                        ? maskAccountNumber(seller.bankDetails.accountNumber)
                        : "",
                    ifsc: seller.bankDetails?.ifsc || "",
                    bankName: seller.bankDetails?.bankName || "",
                    verifiedAt: seller.bankDetails?.verifiedAt || null
                },

                // GST — verified, read-only
                gst: seller.gst?.verified
                    ? {
                        verified: true,
                        gstNumber: seller.gst.gstNumber,
                        businessName: seller.gst.businessName || "",
                        organizationType: seller.gst.organizationType || "",
                        address: seller.gst.address || "",
                        city: seller.gst.city || "",
                        state: seller.gst.state || "",
                        pincode: seller.gst.pincode || "",
                        businessActivities: seller.gst.businessActivities || [],
                        verifiedAt: seller.gst.verifiedAt || null
                    }
                    : { verified: false },

                // MSME — verified, read-only
                msme: seller.msme?.verified
                    ? {
                        verified: true,
                        udyamNumber: seller.msme.udyamNumber || "",
                        businessName: seller.msme.businessName || "",
                        organizationType: seller.msme.organizationType || "",
                        address: seller.msme.address || "",
                        city: seller.msme.city || "",
                        state: seller.msme.state || "",
                        pincode: seller.msme.pincode || "",
                        businessActivities: seller.msme.businessActivities || [],
                        verifiedAt: seller.msme.verifiedAt || null
                    }
                    : { verified: false },

                // Editable fields
                editable: {
                    sellingMode: seller.mode,
                    contactEmail: seller.contactEmail,
                    businessDescription: seller.businessDescription
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch profile review", error: error.message });
    }
}

// ─── PATCH /sellers/onboarding/profile ───────────────────────────────────────
// Only allows updating editable fields: mode, contactEmail, businessDescription

async function updateOnboardingProfile(req, res) {
    try {
        const seller = req.seller;
        const { mode, contactEmail, contactPhone, businessDescription } = req.body;

        const freshSeller = await Seller.findById(seller._id);

        if (mode !== undefined) {
            const validModes = ["retail", "wholesale", "hybrid"];
            if (!validModes.includes(mode)) {
                return res.status(400).json({ message: "mode must be retail, wholesale, or hybrid" });
            }
            freshSeller.mode = mode;
        }
        if (contactEmail !== undefined) freshSeller.contactEmail = contactEmail;
        if (contactPhone !== undefined) freshSeller.contactPhone = contactPhone;
        if (businessDescription !== undefined) freshSeller.businessDescription = businessDescription;

        await freshSeller.save();

        return res.status(200).json({
            message: "Profile updated successfully",
            editable: {
                sellingMode: freshSeller.mode,
                contactEmail: freshSeller.contactEmail,
                contactPhone: freshSeller.contactPhone,
                businessDescription: freshSeller.businessDescription
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Profile update failed", error: error.message });
    }
}

module.exports = {
    getOnboardingStatus,
    verifyBank,
    verifyGST,
    verifyMSME,
    getProfileReview,
    updateOnboardingProfile,
    computeOnboardingCompleted   // exported for use in sellerController
};
