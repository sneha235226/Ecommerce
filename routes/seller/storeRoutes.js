const express = require("express");
const uploadToS3 = require("../../middleware/multer");
const { getStore, createStore, updateStore, updateStoreLocation } = require("../../controllers/seller/storeController");

const router = express.Router();
const upload = uploadToS3("stores");

router.post(
  "/create",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  createStore
);

router.get("/my-store", getStore);

router.put(
  "/update",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  updateStore
);

// PATCH /store/location — update store GPS coordinates only
router.patch("/location", updateStoreLocation);

module.exports = router;