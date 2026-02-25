const express = require("express");
const { getProductById, getProducts, getProductBySubcategory, getProductBySpecificStore } = require("../../../controllers/public/productController");

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.get("/subcategory/:subcategory", getProductBySubcategory);
router.get("/store/:store", getProductBySpecificStore);

module.exports = router;
