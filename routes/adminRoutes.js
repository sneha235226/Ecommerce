const express = require("express");
const { requireAdminAuth } = require("../middleware/auth");
const {
  createAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
} = require("../controllers/adminController");

const router = express.Router();

router.use(requireAdminAuth);

router.post("/", createAdmin);
router.get("/", getAdmins);
router.get("/:id", getAdminById);
router.put("/:id", updateAdmin);
router.patch("/:id", updateAdmin);
router.delete("/:id", deleteAdmin);

module.exports = router;
