const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const FROM = `"${process.env.SMTP_FROM_NAME || "Support"}" <${process.env.SMTP_USER}>`;
const BRAND = process.env.SMTP_FROM_NAME || "Our Platform";
const BRAND_COLOR = "#4F46E5";

function baseLayout(content) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${BRAND}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} ${BRAND}. All rights reserved.</p>
              <p style="margin:6px 0 0;color:#9ca3af;font-size:12px;">This is an automated email. Please do not reply directly to this message.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Admin replied to a user/seller query ─────────────────────────────────────
async function sendAdminReplyEmail({ toEmail, toName, subject, originalMessage, adminReply }) {
    const content = `
      <p style="margin:0 0 6px;color:#374151;font-size:16px;">Hi <strong>${toName}</strong>,</p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Thank you for reaching out to us. We sincerely apologize for any inconvenience you may have experienced.
        Our support team has carefully reviewed your query and responded below.
      </p>

      <div style="background:#f9fafb;border-left:4px solid #d1d5db;border-radius:6px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Your Message</p>
        <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">${originalMessage}</p>
      </div>

      <div style="background:#eff6ff;border-left:4px solid ${BRAND_COLOR};border-radius:6px;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0 0 6px;font-size:11px;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Our Response</p>
        <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.6;">${adminReply}</p>
      </div>

      <p style="margin:0 0 6px;color:#6b7280;font-size:13px;line-height:1.6;">
        You can view this reply anytime from your portal dashboard. If you have further questions or need additional assistance, please don't hesitate to reach out — we're always happy to help.
      </p>
      <p style="margin:20px 0 0;color:#374151;font-size:13px;line-height:1.8;">
        Warm regards,<br/>
        <strong>Support Team, ${BRAND}</strong>
      </p>
    `;
    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject: `Re: ${subject}`,
        html: baseLayout(content)
    });
}

// ── Seller replied to a user's product query ─────────────────────────────────
async function sendSellerReplyEmail({ toEmail, toName, subject, originalMessage, sellerReply, productTitle }) {
    const content = `
      <p style="margin:0 0 6px;color:#374151;font-size:16px;">Hi <strong>${toName}</strong>,</p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Thank you for your interest${productTitle ? ` in <strong>${productTitle}</strong>` : ""}.
        We apologize for any inconvenience caused. The seller has reviewed your query and responded below.
      </p>

      <div style="background:#f9fafb;border-left:4px solid #d1d5db;border-radius:6px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Your Message</p>
        <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">${originalMessage}</p>
      </div>

      <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0 0 6px;font-size:11px;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Seller's Response</p>
        <p style="margin:0;color:#166534;font-size:14px;line-height:1.6;">${sellerReply}</p>
      </div>

      <p style="margin:0 0 6px;color:#6b7280;font-size:13px;line-height:1.6;">
        You can view this reply anytime from your portal dashboard. For further assistance, feel free to contact our support team.
      </p>
      <p style="margin:20px 0 0;color:#374151;font-size:13px;line-height:1.8;">
        Warm regards,<br/>
        <strong>Support Team, ${BRAND}</strong>
      </p>
    `;
    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject: `Re: Your query about "${productTitle || subject}"`,
        html: baseLayout(content)
    });
}

// ── Admin sends announcement/custom mail to any recipient ────────────────────
async function sendAnnouncementEmail({ toEmail, toName, subject, body }) {
    const content = `
      <p style="margin:0 0 6px;color:#374151;font-size:16px;">Hi <strong>${toName || "there"}</strong>,</p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        We hope this message finds you well. We have an important update to share with you — please read the details below.
      </p>

      <div style="color:#374151;font-size:14px;line-height:1.8;margin-bottom:28px;">
        ${body}
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
      <p style="margin:0 0 6px;color:#6b7280;font-size:13px;line-height:1.6;">
        If you have any questions regarding this update, please visit your portal dashboard or contact our support team.
      </p>
      <p style="margin:20px 0 0;color:#374151;font-size:13px;line-height:1.8;">
        Warm regards,<br/>
        <strong>Team ${BRAND}</strong>
      </p>
    `;
    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject,
        html: baseLayout(content)
    });
}

module.exports = { sendAdminReplyEmail, sendSellerReplyEmail, sendAnnouncementEmail };
