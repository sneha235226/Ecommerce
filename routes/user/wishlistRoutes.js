const express = require("express")
const { toggleWishlist, getWishlist, removeWishlistItem, clearWishlist } = require("../../controllers/user/wishlistController");
const { requireUserAuth } = require("../../middleware/auth")

const router = express.Router()

router.post("/toggle", requireUserAuth, toggleWishlist);
router.get("/my-wishlist", requireUserAuth, getWishlist);
router.post("/remove", requireUserAuth, removeWishlistItem);
router.delete("/clear", requireUserAuth, clearWishlist);

module.exports = router