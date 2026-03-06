const express = require("express");
const {
  listSellers,
  getSellerById,
  approveSeller,
  rejectSeller,
  suspendSeller,
  reinstateSeller,
} = require("../../controllers/admin/sellerController");

const router = express.Router();

router.get("/", listSellers);
router.get("/:id", getSellerById);
router.patch("/:id/approve", approveSeller);
router.patch("/:id/reject", rejectSeller);
router.patch("/:id/suspend", suspendSeller);
router.patch("/:id/reinstate", reinstateSeller);

module.exports = router;
