const express = require("express");
const { getNearbyStores, getNearbyStoreProducts, getStoreById } = require("../../../controllers/public/storeController");

const router = express.Router();

// GET /api/public/stores/nearby?lat=&lng=&mode=retail|wholesale&page=&limit=
router.get("/nearby", getNearbyStores);

// GET /api/public/stores/nearby/products?lat=&lng=&mode=retail|wholesale&page=&limit=
router.get("/nearby/products", getNearbyStoreProducts);

// GET /api/public/stores/:storeId
router.get("/:storeId", getStoreById);

module.exports = router;
