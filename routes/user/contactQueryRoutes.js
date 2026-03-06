const express = require("express")
const { requireUserAuth } = require("../../middleware/auth");
const { createQuery } = require("../../controllers/user/contactQuery");

const router = express.Router()

router.post("/create", requireUserAuth, createQuery);

module.exports = router