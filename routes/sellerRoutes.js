const express = require("express");
const { requireAuth, requireSellerAuth } = require("../middleware/auth");
const {
  createSeller,
  listSellers,
  getMySellerProfile,
  getSellerById,
  updateSeller,
  deleteSeller,
  verifySellerBusinessPan,
} = require("../controllers/sellerController");

const router = express.Router();

function requireAdmin(req, res, next) {
  const isAdminToken = req.tokenPayload?.role === "admin";
  const isAdminModel = req.user?.constructor?.modelName === "Admin";
  if (!isAdminToken && !isAdminModel) {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

router.post("/", requireAuth, createSeller);
router.get("/", requireAdmin, listSellers);
router.get("/me", requireAuth, getMySellerProfile);
router.get("/:id", requireAuth, getSellerById);
router.put("/:id", requireAuth, updateSeller);
router.patch("/:id", requireAuth, updateSeller);
router.delete("/:id", requireAdmin, deleteSeller);
router.post("/verify-pan", requireSellerAuth, verifySellerBusinessPan);

module.exports = router;
