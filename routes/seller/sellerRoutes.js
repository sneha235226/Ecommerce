const express = require("express");
const { requireAuth, requireSellerAuth } = require("../../middleware/auth");
const productRoutes = require("./productRoutes");
const storeRoutes = require("./storeRoutes");
const orderRoutes = require("./orderRoutes");
const {
  createSeller,
  listSellers,
  getMySellerProfile,
  getSellerById,
  updateSeller,
  deleteSeller,
  verifySellerBusinessPan,
} = require("../../controllers/seller/sellerController");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.constructor?.modelName !== "Admin") {
    return res.status(403).json({
      message: "Admin access required"
    });
  }
  next();
}

router.post("/", requireAuth, createSeller);

// Seller routes first
router.get("/me", requireSellerAuth, getMySellerProfile);
router.patch("/update", requireSellerAuth, updateSeller);
router.post("/verify-pan", requireSellerAuth, verifySellerBusinessPan);

// Nested routes
router.use("/products", requireAuth, requireSellerAuth, productRoutes);
router.use("/store", requireAuth, requireSellerAuth, storeRoutes);
router.use("/orders", requireAuth, requireSellerAuth, orderRoutes);

// Admin
router.get("/", requireAuth, requireAdmin, listSellers);
router.delete("/:id", requireAuth, requireAdmin, deleteSeller);
router.get("/:id", requireAuth, requireAdmin, getSellerById);

module.exports = router;
