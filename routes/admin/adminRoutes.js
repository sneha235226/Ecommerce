const express = require("express");
const { requireAdminAuth } = require("../../middleware/auth");
const { me } = require("../../controllers/auth/adminAuthController");
const categoryRoutes = require("../admin/categoryRoutes");
const subcategoryRoutes = require("../admin/subcategoryRoutes");
const userRoutes = require("../admin/userRoutes");
const dashboardRoutes = require("../admin/dashboardRoutes");
const sellerRoutes = require("../admin/sellerRoutes");
const settingsRoutes = require("../admin/settingsRoutes");
const orderRoutes = require("../admin/orderRoutes");
const adminQueryRoutes = require("../admin/adminQueryRoutes");
const mailRoutes = require("../admin/mailRoutes");

const router = express.Router();

router.use(requireAdminAuth);
router.get("/me", me);
router.use("/dashboard", dashboardRoutes);
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);
router.use("/users", userRoutes);
router.use("/sellers", sellerRoutes);
router.use("/settings", settingsRoutes);
router.use("/orders", orderRoutes);
router.use("/queries", adminQueryRoutes);
router.use("/mail", mailRoutes);

module.exports = router;
