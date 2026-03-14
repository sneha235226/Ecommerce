const express = require("express");
const { requireUserAuth } = require("../../middleware/auth");
const { sendQuery, getMyQueries } = require("../../controllers/user/adminQueryController");

const router = express.Router();

router.post("/send", requireUserAuth, sendQuery);
router.get("/my-queries", requireUserAuth, getMyQueries);

module.exports = router;
