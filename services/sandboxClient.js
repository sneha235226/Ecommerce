const http = require("http");
const https = require("https");

const {
  SANDBOX_API_BASE_URL = "https://api.sandbox.co.in",
  SANDBOX_API_KEY,
  SANDBOX_API_SECRET,
  SANDBOX_API_VERSION = "2.0",
  SANDBOX_AUTH_VERSION = "1.0.0"
} = process.env;

let cachedToken = null;
let tokenExpiresAt = 0;

function requestJson(method, path, headers, body) {
  const baseUrl = new URL(SANDBOX_API_BASE_URL);
  const isHttps = baseUrl.protocol === "https:";
  const lib = isHttps ? https : http;
  const payload = body ? JSON.stringify(body) : null;

  const reqHeaders = { ...headers };
  if (payload) {
    reqHeaders["Content-Type"] = "application/json";
    reqHeaders["Content-Length"] = Buffer.byteLength(payload);
  }

  const options = {
    method,
    hostname: baseUrl.hostname,
    port: baseUrl.port || (isHttps ? 443 : 80),
    path,
    headers: reqHeaders
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (err) {
          return reject(new Error(`Failed to parse JSON response: ${err.message}`));
        }
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
  if (!token) {
    throw new Error("Failed to get access token from Sandbox");
  }

  cachedToken = token;
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
  return token;
}

async function verifyPanDetails({
  pan,
  nameAsPerPan,
  dateOfBirth,
  consent = "Y",
  reason,
  acceptCache
}) {
  const token = await getAccessToken();
  const headers = {
    Authorization: token,
    "x-api-key": SANDBOX_API_KEY,
    "x-api-version": SANDBOX_API_VERSION
  };

  if (acceptCache !== undefined) {
    headers["x-accept-cache"] = String(acceptCache);
  }

  const payload = {
    "@entity": "in.co.sandbox.kyc.pan_verification.request",
    pan,
    consent,
    reason
  };

  if (nameAsPerPan) payload.name_as_per_pan = nameAsPerPan;
  if (dateOfBirth) payload.date_of_birth = dateOfBirth;

  return requestJson("POST", "/kyc/pan/verify", headers, payload);
}

module.exports = {
  verifyPanDetails
};
