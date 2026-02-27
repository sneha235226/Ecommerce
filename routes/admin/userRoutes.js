const express = require("express");
const { getUsers, getUserById, getSuspiciousUsers, blockUser, unblockUser } = require("../../controllers/admin/userController");
const { requireAdminAuth } = require("../../middleware/auth");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/user-list", getUsers);
router.get("/suspicious", getSuspiciousUsers);
router.post("/block/:id", blockUser);
router.post("/unblock/:id", unblockUser);
router.get("/:id", getUserById);

module.exports = router;