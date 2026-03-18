const express = require("express");
const { getNotifications, getUnreadCount, markOneRead, markAllRead } = require("../../controllers/user/notificationController");

const router = express.Router();

router.get("/",             getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all",   markAllRead);
router.patch("/:id/read",   markOneRead);

module.exports = router;
