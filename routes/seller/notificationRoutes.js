const express = require("express");
const { getReceived, getUnreadCount, markOneRead, markAllRead, sendToUser, getSentHistory } = require("../../controllers/seller/notificationController");

const router = express.Router();

router.get("/received",         getReceived);
router.get("/unread-count",     getUnreadCount);
router.patch("/read-all",       markAllRead);
router.patch("/:id/read",       markOneRead);
router.post("/send",            sendToUser);
router.get("/sent",             getSentHistory);

module.exports = router;
