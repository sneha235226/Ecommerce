const express = require("express")
const { addToCart, getCart, updateQuantity, removeItem, clearCart , checkoutCart} = require("../../controllers/user/cartController")
const { requireUserAuth } = require("../../middleware/auth")

const router = express.Router()

router.post("/add", requireUserAuth, addToCart);
router.get("/my-cart", requireUserAuth, getCart);
router.patch("/quantity", requireUserAuth, updateQuantity);
router.delete("/remove", requireUserAuth, removeItem);
router.delete("/clear", requireUserAuth, clearCart);
router.post("/checkout", requireUserAuth, checkoutCart);

module.exports = router