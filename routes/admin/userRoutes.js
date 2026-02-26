const express = require("express");
const { getUsers, getUserById } = require("../../controllers/admin/userController");
const { requireAdminAuth } = require("../../middleware/auth");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/user-list", getUsers);
router.get("/:id", getUserById);

module.exports = router;