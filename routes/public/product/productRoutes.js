const express = require("express");
const { getProductById, getProducts } = require("../../../controllers/public/productController");

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);

module.exports = router;
