const express = require("express");
const { createProduct, updateProduct, deleteProduct, getAllMyProducts, getProductById } = require("../../controllers/seller/productController");
const uploadToS3 = require("../../middleware/multer");

const router = express.Router();
const upload = uploadToS3("products");

router.post("/create/product", upload.any(), createProduct)
router.get("/all-products", getAllMyProducts)
router.get("/:id", getProductById)
router.put("/update/:id", upload.any(), updateProduct)
router.delete("/delete/:id", deleteProduct)

module.exports = router;