const express = require("express");
const {
    sendMailToUser,
    sendMailToSeller,
    broadcastToAllUsers,
    broadcastToAllSellers
} = require("../../controllers/admin/mailController");

const router = express.Router();

// requireAdminAuth applied by parent adminRoutes.js
router.post("/send-to-user", sendMailToUser);
router.post("/send-to-seller", sendMailToSeller);
router.post("/broadcast/users", broadcastToAllUsers);
router.post("/broadcast/sellers", broadcastToAllSellers);

module.exports = router;
