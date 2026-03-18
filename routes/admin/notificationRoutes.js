const express = require("express");
const { sendToUser, sendToSeller, broadcastToUsers, broadcastToSellers, getSentHistory } = require("../../controllers/admin/notificationController");

const router = express.Router();

router.post("/send/user",           sendToUser);
router.post("/send/seller",         sendToSeller);
router.post("/broadcast/users",     broadcastToUsers);
router.post("/broadcast/sellers",   broadcastToSellers);
router.get("/sent",                 getSentHistory);

module.exports = router;
