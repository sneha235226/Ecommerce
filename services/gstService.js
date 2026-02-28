const axios = require("axios");

// Send OTP
const sendGSTOtp = async (gstNumber) => {
    try {
        const response = await axios.post(
            `${process.env.SANDBOX_BASE_URL}/gst/verify/otp`,
            {
                gstin: gstNumber
            },
            {
                headers: {
                    "x-api-key": process.env.SANDBOX_API_KEY,
                    "x-api-secret": process.env.SANDBOX_API_SECRET,
                    "Content-Type": "application/json"
                }
            }
        );
        return response.data;
    } catch (error) {
        console.log("GST OTP Error");
        console.log(error.response?.data || error.message);
        return null;
    }
};

// Verify OTP
const verifyGSTOtp = async (gstNumber, otp) => {
    try {
        const response = await axios.post(
            `${process.env.SANDBOX_BASE_URL}/gst/verify`,
            {
                gstin: gstNumber,
                otp: otp
            },
            {
                headers: {
                    "x-api-key": process.env.SANDBOX_API_KEY,
                    "x-api-secret": process.env.SANDBOX_API_SECRET,
                    "Content-Type": "application/json"
                }
            }
        );
        return response.data;
    } catch (error) {
        console.log("GST Verify Error");
        console.log(error.response?.data || error.message);
        return null;
    }
};

module.exports = {
    sendGSTOtp,
    verifyGSTOtp
};