const https = require("https");
const crypto = require("crypto");

const {
    SANDBOX_API_KEY,
    SANDBOX_API_SECRET,
    SANDBOX_API_BASE_URL = "https://api.sandbox.co.in",
    SANDBOX_API_VERSION = "2.0"
} = process.env;


function sha256(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function sign(secret, data) {
    return crypto.createHmac("sha256", secret).update(data).digest("base64");
}



function buildHeaders(payload) {
    const date = new Date().toISOString();
    const payloadHash = sha256(payload);
    const signature = sign(
        SANDBOX_API_SECRET,
        payloadHash + date
    );

    return {
        "x-api-key": SANDBOX_API_KEY,
        "x-api-version": SANDBOX_API_VERSION,
        "x-amz-date": date,
        Authorization: signature,
        "Content-Type": "application/json"
    };
}



function request(path, body) {

    const payload = JSON.stringify(body);

    const headers = buildHeaders(payload);

    return new Promise((resolve, reject) => {

        const req = https.request({

            hostname: "api.sandbox.co.in",

            path,

            method: "POST",

            headers

        },

            res => {

                let data = "";

                res.on("data", chunk => data += chunk);

                res.on("end", () => {

                    resolve(JSON.parse(data));

                });

            });

        req.on("error", reject);

        req.write(payload);

        req.end();

    });

}



//
// SEND GST OTP
//

async function sendGSTOtp(gstin) {

    return request(

        "/gst/verify/otp",

        {

            gstin

        }

    );

}



//
// VERIFY GST OTP
//

async function verifyGSTOtp(gstin, otp) {

    return request(

        "/gst/verify",

        {

            gstin,

            otp

        }

    );

}



module.exports = {

    sendGSTOtp,

    verifyGSTOtp

};