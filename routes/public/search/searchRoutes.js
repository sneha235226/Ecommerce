const express = require("express");
const { search, suggest } = require("../../../controllers/public/searchController");

const router = express.Router();

// GET /api/public/search?q=nike&page=1&limit=20
router.get("/", search);

// GET /api/public/search/suggest?q=nik
router.get("/suggest", suggest);

module.exports = router;
