const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");

async function verifyTokenAndAttachUser(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { error: { status: 401, message: "Unauthorized: token missing" } };
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { error: { status: 500, message: "JWT_SECRET is not configured" } };
  }

  const decoded = jwt.verify(token, secret);
  const user =
    decoded.role === "admin"
      ? await Admin.findById(decoded.sub).select("-passwordHash")
      : await User.findById(decoded.sub).select("-passwordHash");

  if (!user || user.isActive === false) {
    return { error: { status: 401, message: "Unauthorized: invalid user" } };
  }

  return { decoded, user };
}

async function requireAuth(req, res, next) {
  try {
    const result = await verifyTokenAndAttachUser(req, res);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    req.user = result.user;
    req.tokenPayload = result.decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

async function requireUserAuth(req, res, next) {
  try {
    const result = await verifyTokenAndAttachUser(req, res);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    if (result.decoded.role === "admin") {
      return res.status(403).json({ message: "Forbidden: user token required" });
    }

    req.user = result.user;
    req.tokenPayload = result.decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

async function requireAdminAuth(req, res, next) {
  try {
    const result = await verifyTokenAndAttachUser(req, res);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    if (result.decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: admin token required" });
    }

    req.user = result.user;
    req.tokenPayload = result.decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

async function requireSellerAuth(req, res, next) {
  try {
    const result = await verifyTokenAndAttachUser(req, res);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    if (result.decoded.role !== "seller") {
      return res.status(403).json({ message: "Forbidden: seller token required" });
    }

    req.user = result.user;
    req.tokenPayload = result.decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
} 

module.exports = { requireAuth, requireUserAuth, requireAdminAuth, requireSellerAuth};
