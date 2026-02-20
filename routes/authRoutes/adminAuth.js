const express = require("express");
const { requireAdminAuth } = require("../../middleware/auth");
const { login, me } = require("../../controllers/authControllers/adminAuthController");

const router = express.Router();

router.post("/login", login);
router.get("/me", requireAdminAuth, me);

module.exports = router;
