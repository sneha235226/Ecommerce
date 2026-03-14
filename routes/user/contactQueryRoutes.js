const express = require("express")
const { requireUserAuth } = require("../../middleware/auth");
const { createQuery, getMyQueries, getQueryById } = require("../../controllers/user/contactQuery");

const router = express.Router()

router.post("/create", requireUserAuth, createQuery);
router.get("/my-queries", requireUserAuth, getMyQueries);
router.get("/:queryId", requireUserAuth, getQueryById);

module.exports = router