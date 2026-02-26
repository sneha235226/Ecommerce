const express = require("express");
const { requireAdminAuth } = require("../../middleware/auth");
const { me } = require("../../controllers/auth/adminAuthController");
const categoryRoutes = require("../admin/categoryRoutes");
const subcategoryRoutes = require("../admin/subcategoryRoutes");
const userRoutes = require("../admin/userRoutes");  

const router = express.Router();

router.use(requireAdminAuth);
router.get("/me", me);
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);
router.use("/users", userRoutes);

module.exports = router;
