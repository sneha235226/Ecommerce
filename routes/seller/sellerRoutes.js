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
  verifySellerBusinessPan,
  deleteSeller
} = require("../../controllers/seller/sellerController");
const flagRoutes = require("./flagRoutes");

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
router.delete("/delete", requireSellerAuth, deleteSeller);  

// Nested routes
router.use("/products", requireAuth, requireSellerAuth, productRoutes);
router.use("/store", requireAuth, requireSellerAuth, storeRoutes);
router.use("/orders", requireAuth, requireSellerAuth, orderRoutes);
router.use("/flags", requireAuth, requireSellerAuth, flagRoutes);

// Admin
router.get("/", requireAuth, requireAdmin, listSellers);
router.get("/:id", requireAuth, requireAdmin, getSellerById);


module.exports = router;
