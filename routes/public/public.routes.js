const express = require("express");
const categoryRoutes = require("./category/categoryRoutes");
const productRoutes = require("./product/productRoutes");
const storeRoutes = require("./store/storeRoutes");

const router = express.Router();

router.use('/category', categoryRoutes);
router.use('/product', productRoutes);
router.use('/stores', storeRoutes);

module.exports = router;
