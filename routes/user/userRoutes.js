const express = require("express");
const { requireAuth } = require("../../middleware/auth");
const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../../controllers/user/userController");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

router.use(requireAuth);

router.post("/", createUser);
router.get("/", requireAdmin, getUsers);
router.get("/:id", getUserById);
router.patch("/:id", updateUser);
router.delete("/:id", requireAdmin, deleteUser);

module.exports = router;