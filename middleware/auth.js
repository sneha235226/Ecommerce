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

async function requireSellerAuth(req, res, next) {

  const result = await verifyTokenAndAttachUser(req, res);

  if (result.error) {
    return res.status(result.error.status)
      .json({ message: result.error.message });
  }

  const seller = await Seller.findOne({
    user: result.user._id
  });

  if (!seller) {
    return res.status(403).json({
      message: "Seller account required"
    });
  }

  req.user = result.user;
  req.tokenPayload = result.decoded;
  req.seller = seller;

  next();
}

module.exports = { requireAuth, requireUserAuth, requireAdminAuth, requireSellerAuth };
