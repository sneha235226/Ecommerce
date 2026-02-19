const jwt = require("jsonwebtoken");

function generateAuthToken(user, roleOverride) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set in environment variables.");
  }

  return jwt.sign(
    {
      sub: user._id.toString(),
      role: roleOverride || user.role,
      email: user.email || null,
      phone: user.phone || null,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

module.exports = { generateAuthToken };
