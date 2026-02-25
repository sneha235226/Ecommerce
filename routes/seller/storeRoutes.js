const express = require("express");
const uploadToS3 = require("../../middleware/multer");
const { getStore, createStore, deleteStore , updateStore} = require("../../controllers/seller/storeController");

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

router.delete("/delete", deleteStore);

module.exports = router;