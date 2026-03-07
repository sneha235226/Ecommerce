const express = require("express");
const { getSettings, updateSettings } = require("../../controllers/admin/settingsController");

const router = express.Router();

router.get("/", getSettings);
router.patch("/", updateSettings);

module.exports = router;
