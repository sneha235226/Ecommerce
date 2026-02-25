const express = require("express");
const { requireAdminAuth } = require("../../middleware/auth");
const { register, login, me } = require("../../controllers/auth/adminAuthController");
const categoryRoutes = require("../admin/categoryRoutes");
const subcategoryRoutes = require("../admin/subcategoryRoutes");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.use(requireAdminAuth);
router.get("/me", me);
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);

module.exports = router;
