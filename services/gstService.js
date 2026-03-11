/**
 * Sandbox GST OTP service
 *
 * Auth scheme for /gst/* endpoints:
 *   1. POST /authenticate  → get access_token
 *   2. Set Authorization = raw access_token (no "Bearer " prefix, no HMAC)
 *      along with x-api-key and x-api-version: 2.0
 *
 * Confirmed wrong approaches:
 *   - HMAC-SHA256(api_secret, hash+date)    → 403
 *   - HMAC-SHA256(access_token, hash+date)  → 403
 *   - "Bearer <access_token>"               → 400
 *   Correct: raw access_token as Authorization value
 */

const https = require("https");

const {
    SANDBOX_API_KEY,
    SANDBOX_API_SECRET,
    SANDBOX_API_BASE_URL = "https://api.sandbox.co.in",
    SANDBOX_API_VERSION = "2.0",
    SANDBOX_AUTH_VERSION = "1.0.0"
} = process.env;

// ─── Token cache ──────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

function requestJson(method, path, headers, body) {
    const baseUrl = new URL(SANDBOX_API_BASE_URL);
    const payload = body ? JSON.stringify(body) : null;

    const reqHeaders = { ...headers };
    if (payload) {
        reqHeaders["Content-Type"] = "application/json";
        reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const options = {
        method,
        hostname: baseUrl.hostname,
        port: baseUrl.port || 443,
        path,
        headers: reqHeaders
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let raw = "";
            res.on("data", (chunk) => { raw += chunk; });
            res.on("end", () => {
                let data = null;
                try { data = raw ? JSON.parse(raw) : null; }
                catch (e) { return reject(new Error(`Sandbox GST parse error: ${e.message}`)); }
                resolve({ status: res.statusCode, data });
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }
    if (!SANDBOX_API_KEY || !SANDBOX_API_SECRET) {
        throw new Error("Missing SANDBOX_API_KEY or SANDBOX_API_SECRET");
    }
    const res = await requestJson("POST", "/authenticate", {
        "x-api-key": SANDBOX_API_KEY,
        "x-api-secret": SANDBOX_API_SECRET,
        "x-api-version": SANDBOX_AUTH_VERSION
    });
    const token = res?.data?.data?.access_token;
    if (!token) throw new Error("Failed to get Sandbox access token");
    cachedToken = token;
    tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return token;
}

// Raw access_token as Authorization — no "Bearer " prefix, no HMAC
function buildHeaders(accessToken) {
    return {
        Authorization: accessToken,
        "x-api-key": SANDBOX_API_KEY,
        "x-api-version": SANDBOX_API_VERSION
    };
}

// ─── Send GST OTP ─────────────────────────────────────────────────────────────

async function sendGSTOtp(gstin) {
    const token = await getAccessToken();
    return requestJson("POST", "/gst/verify/otp", buildHeaders(token), { gstin });
}

// ─── Verify GST OTP ───────────────────────────────────────────────────────────

async function verifyGSTOtp(gstin, otp) {
    const token = await getAccessToken();
    return requestJson("POST", "/gst/verify", buildHeaders(token), { gstin, otp });
}

module.exports = { sendGSTOtp, verifyGSTOtp };
