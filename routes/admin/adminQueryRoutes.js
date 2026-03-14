const express = require("express");
const { getAllQueries, replyToQuery, updateQueryStatus } = require("../../controllers/admin/adminQueryController");

const router = express.Router();

router.get("/", getAllQueries);
router.post("/:queryId/reply", replyToQuery);
router.patch("/:queryId/status", updateQueryStatus);

module.exports = router;
