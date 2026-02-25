const express = require("express");
const uploadToS3 = require("../../middleware/multer");
const {
    createSubcategory,
    updateSubcategory,
    getSubcategories,
    getSubcategoryById,
    toggleSubcategory
} = require("../../controllers/admin/subcategoryController");

const router = express.Router();
const upload = uploadToS3("subcategories");

router.post(
    "/create",
    upload.single("image"),
    createSubcategory
);
router.get("/", getSubcategories);
router.get("/:id", getSubcategoryById);
router.put(
    "/:id",
    upload.single("image"),
    updateSubcategory
);
router.patch(
    "/toggle/:id",
    toggleSubcategory
);

module.exports = router;