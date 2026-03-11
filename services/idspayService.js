/**
 * IDSPay verification service
 *
 * Environment variables:
 *   IDSPAY_BASE_URL  — base URL  (e.g. https://javabackend.idspay.in/api/v1/uat)
 *   IDSPAY_API_ID    — api_id sent in every request body
 *   IDSPAY_API_KEY   — api_key sent in every request body
 *   IDSPAY_TOKEN_ID  — token_id sent in every request body
 *
 * Endpoints:
 *   POST {base}/srv2/validation/kyb/gst           — GST Verification Srv2
 *   POST {base}/srv2/validation/kyb/pan-to-udyam  — Pan To Udyam (Srv2)
 *   POST {base}/bank-verification/pennyless         — Bank A/c Verification Penny Less
 */

const https = require("https");
const http = require("http");

const {
    IDSPAY_BASE_URL = "https://javabackend.idspay.in/api/v1/uat",
    IDSPAY_API_ID,
    IDSPAY_API_KEY,
    IDSPAY_TOKEN_ID
} = process.env;

// ─── low-level HTTP helper ───────────────────────────────────────────────────

function idspayRequest(pathSuffix, extraBody) {
    if (!IDSPAY_API_ID || !IDSPAY_API_KEY || !IDSPAY_TOKEN_ID) {
        return Promise.reject(new Error("IDSPAY_API_ID, IDSPAY_API_KEY, and IDSPAY_TOKEN_ID must all be configured"));
    }

    const body = {
        api_id: IDSPAY_API_ID,
        api_key: IDSPAY_API_KEY,
        token_id: IDSPAY_TOKEN_ID,
        ...extraBody
    };

    const payload = JSON.stringify(body);
    const baseUrl = new URL(IDSPAY_BASE_URL);
    const isHttps = baseUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    // Combine the base path (e.g. /api/v1/uat) with the service path suffix
    const basePath = baseUrl.pathname.replace(/\/$/, "");
    const fullPath = basePath + pathSuffix;

    const options = {
        method: "POST",
        hostname: baseUrl.hostname,
        port: baseUrl.port || (isHttps ? 443 : 80),
        path: fullPath,
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
        }
    };

    return new Promise((resolve, reject) => {
        const req = lib.request(options, (res) => {
            let raw = "";
            res.on("data", (chunk) => { raw += chunk; });
            res.on("end", () => {
                let data = null;
                try { data = raw ? JSON.parse(raw) : null; }
                catch (e) { return reject(new Error(`IDSPay parse error: ${e.message}`)); }
                resolve({ status: res.statusCode, data });
            });
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}

// ─── GST Verification (Srv2) ─────────────────────────────────────────────────
// Request body:  { gstin }
// Response:      { lgnm, ctb, pradr: { adr, stcd, pncd, dst }, gstin, nba, ... }

async function verifyGSTIN(gstin) {
    return idspayRequest("/srv2/validation/kyb/gst", {
        gstin: gstin.toUpperCase()
    });
}

// ─── Pan To Udyam Verification (Srv2) ────────────────────────────────────────
// Request body:  { pan }
// Response:      { official_name, organization_type,
//                  official_address: { city, state, pincode }, major_activity }

async function verifyMSMEByPan(pan) {
    return idspayRequest("/srv2/validation/kyb/pan-to-udyam", {
        pan: pan.toUpperCase()
    });
}

// ─── Bank A/c Verification Penny Less ────────────────────────────────────────
// Request body:  { account_number, bank_ifsc, ifsc_details }
// Response:      { ... account_holder_name, bank_name, ifsc_details, ... }

async function verifyBankAccount(accountNumber, ifsc) {
    return idspayRequest("/bank-verification/pennyless", {
        account_number: accountNumber,
        bank_ifsc:      ifsc.toUpperCase(),
        ifsc_details:   true
    });
}

module.exports = { verifyBankAccount, verifyGSTIN, verifyMSMEByPan };
