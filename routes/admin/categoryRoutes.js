const express = require("express");
const { requireAdminAuth } = require("../../middleware/auth");
const { createCategory, getCategories, getCategoryById, updateCategory, toggleCategory } = require("../../controllers/admin/categoryController");

const router = express.Router();

router.use(requireAdminAuth);

router.post("/", createCategory);
router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.patch("/:id", updateCategory);
router.delete("/:id", toggleCategory);

module.exports = router;
