const express = require("express");
const categoryRoutes = require("./category/categoryRoutes");
const productRoutes = require("./product/productRoutes");

const router = express.Router();

router.use('/category', categoryRoutes);
router.use('/product', productRoutes);

module.exports = router;
