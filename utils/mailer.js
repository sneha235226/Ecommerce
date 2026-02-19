const nodemailer = require("nodemailer");

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP configuration is missing. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendOtpEmail(to, otp) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Email Verification OTP</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:36px 48px;">
                  <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Verify your email</h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:40px 48px;">
                  <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.6;">
                    Use the OTP below to verify your email address. It is valid for <strong>10 minutes</strong>.
                  </p>
                  <!-- OTP Box -->
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center">
                        <div style="display:inline-block;background:#f3f4f6;border:2px dashed #667eea;border-radius:12px;padding:20px 48px;margin:8px 0;">
                          <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#4f46e5;font-family:'Courier New',monospace;">${otp}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                    If you didn&apos;t request this, you can safely ignore this email. Do <strong>not</strong> share this OTP with anyone.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                    &copy; ${new Date().getFullYear()} Ecommerce App. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: "Your email verification OTP",
    html,
  });
}

module.exports = { sendOtpEmail };
