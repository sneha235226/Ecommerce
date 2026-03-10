const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Seller = require("../models/Seller");

async function verifyTokenAndAttachUser(req, res) {
  const authHeader = req.headers.authorization || "";

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return {
      error: {
        status: 401,
        message: "Unauthorized: token missing"
      }
    };
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  let user = await Admin.findById(decoded.sub)
    .select("-passwordHash");

  if (!user) {
    user = await User.findById(decoded.sub)
      .select("-passwordHash");
  }

  if (!user) {
    return {
      error: {
        status: 401,
        message: "Unauthorized: invalid user"
      }
    };
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

// Verifies a seller JWT and returns the Seller document.
// Sellers authenticate independently — no User lookup.
async function verifySellerToken(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { error: { status: 401, message: "Unauthorized: token missing" } };
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const role = decoded.role;
  const isSeller = role === "seller" ||
    (Array.isArray(role) && role.includes("seller"));

  if (!isSeller) {
    return { error: { status: 403, message: "Forbidden: seller token required" } };
  }

  const seller = await Seller.findById(decoded.sub).select("-passwordHash");
  if (!seller) {
    return { error: { status: 401, message: "Unauthorized: seller not found" } };
  }

  if (!seller.isActive) {
    return { error: { status: 401, message: "Seller account is inactive" } };
  }

  return { decoded, seller };
}

// Seller exists — for profile/verification routes accessible before admin approval
async function requireAnySellerAuth(req, res, next) {
  try {
    const result = await verifySellerToken(req);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    req.seller = result.seller;
    req.tokenPayload = result.decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

// Seller exists AND is approved — for product/store/order/dashboard routes
async function requireSellerAuth(req, res, next) {
  try {
    const result = await verifySellerToken(req);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    if (result.seller.status !== "approved") {
      return res.status(403).json({
        message: "Seller account not approved yet",
        status: result.seller.status
      });
    }
    req.seller = result.seller;
    req.tokenPayload = result.decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

module.exports = { requireAuth, requireUserAuth, requireAdminAuth, requireAnySellerAuth, requireSellerAuth };
