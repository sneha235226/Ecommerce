const express = require("express");
const router = express.Router();
const { createReview, getProductReviews, getStoreReviews, getSellerReviews, deleteReview } = require("../../controllers/user/reviewController");
const { requireUserAuth } = require("../../middleware/auth");
const uploadToS3 = require("../../middleware/multer");

router.post(
    "/",
    requireUserAuth,
    uploadToS3("reviews").array("images", 5),
    createReview
);
router.get("/product/:id", requireUserAuth, getProductReviews);
router.get("/store/:id", requireUserAuth, getStoreReviews);
router.get("/seller/:id", requireUserAuth, getSellerReviews);
router.delete("/delete/:id", requireUserAuth, deleteReview);

module.exports = router;