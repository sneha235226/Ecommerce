const express = require("express");
const { getNearbyStores, getNearbyStoreProducts } = require("../../../controllers/public/storeController");

const router = express.Router();

// GET /api/public/stores/nearby?lat=&lng=&mode=retail|wholesale&page=&limit=
router.get("/nearby", getNearbyStores);

// GET /api/public/stores/nearby/products?lat=&lng=&mode=retail|wholesale&page=&limit=
router.get("/nearby/products", getNearbyStoreProducts);

module.exports = router;
