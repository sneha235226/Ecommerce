const axios = require("axios");

function buildOtpMessage({ otp }) {
  return `Dear Customer, your OTP is ${otp}. This OTP is valid for 10 minutes. Do not share this code with anyone. - Vardhman Finance`;
}

/**
 * Send OTP SMS using PowersText API
 * @param {string} phone - Recipient phone number
 * @param {string} otp - OTP code
 */
async function sendOtpSms({ phone, otp }) {
  const baseUrl = process.env.SMS_API_URL || "http://sms1.powerstext.in/http-tokenkeyapi.php";
  const authKey = process.env.SMS_AUTH_KEY;
  const senderId = process.env.SMS_SENDER_ID;
  const route = process.env.SMS_ROUTE || "1";
  const templateId = process.env.SMS_TEMPLATE_ID;

  if (!authKey || !senderId || !templateId) {
    throw new Error("SMS configuration is missing");
  }

  const message = buildOtpMessage({ otp });

  console.log(`Sending SMS to: ${phone}`);

  const response = await axios.get(baseUrl, {
    params: {
      "authentic-key": authKey,
      senderid: senderId,
      route,
      number: phone,
      message,
      templateid: templateId
    },
    timeout: 10000
  });
  
  return response.data;
}

module.exports = {
  sendOtpSms
};
