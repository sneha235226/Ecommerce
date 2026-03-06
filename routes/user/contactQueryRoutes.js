const express = require("express")
const { requireUserAuth } = require("../../middleware/auth");
const { createQuery, getMyQueries } = require("../../controllers/user/contactQuery");

const router = express.Router()

router.post("/create", requireUserAuth, createQuery);
router.get('/my-queries', requireUserAuth, getMyQueries);

module.exports = router