const express = require("express");
const { requireAuth, requireUserAuth } = require("../../middleware/auth");
const cartRoutes = require("./cartRoutes");
const orderRoutes = require("./orderRoutes");
const wishlistRoutes = require("./wishlistRoutes"); 
const reviewRoutes = require("./reviewRoutes");
const contactRoutes = require("./contactQueryRoutes");
const {
    getMyProfile,
    updateProfile,
    changePassword,
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    deleteAccount
} = require("../../controllers/user/userController");
const { saveLocation } = require("../../controllers/user/locationController");
const router = express.Router();

router.use(requireAuth);

router.get("/me",requireUserAuth, getMyProfile);
router.patch("/profile",requireUserAuth, updateProfile);
router.patch("/password",requireUserAuth, changePassword);
router.get("/addresses", requireUserAuth, getAddresses);
router.post("/addresses", requireUserAuth, addAddress);
router.patch("/addresses/:addressId", requireUserAuth, updateAddress);
router.delete("/addresses/:addressId", requireUserAuth, deleteAddress);
router.patch("/addresses/:addressId/default", requireUserAuth, setDefaultAddress);
router.delete("/delete-account", requireUserAuth, deleteAccount);
router.patch("/location", requireUserAuth, saveLocation);

router.use("/cart", cartRoutes);
router.use("/order", orderRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/review", reviewRoutes);
router.use("/contact-query", contactRoutes);

module.exports = router;