const Seller = require("../../models/Seller");
const Store = require("../../models/Store");
const s3 = require("../../config/s3");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");


async function deleteUploadedFiles(filesObj) {
    if (!filesObj) return;
    const files = Object.values(filesObj).flat();
    for (const file of files) {
        if (!file.key) continue;
        await s3.send(
            new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: file.key
            })
        );
    }
}

async function deleteFileByUrl(url) {
    if (!url) return;
    const key = url.split(".amazonaws.com/")[1];
    if (!key) return;
    await s3.send(
        new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        })
    );
}

async function createStore(req, res) {
    try {
        const { description, serviceablePostalCodes, returnPolicy } = req.body;
        const seller = req.seller;
        const existingStore = await Store.findOne({
            seller: seller._id
        });

        if (existingStore) {
            await deleteUploadedFiles(req.files);
            return res.status(400).json({
                message: "Store already exists"
            });
        }

        const store = await Store.create({
            seller: seller._id,
            description: description || "",
            logoUrl:
            req.files?.logo?.[0]?.location || "",
            bannerUrl:
            req.files?.banner?.[0]?.location || "",
            serviceablePostalCodes:
            serviceablePostalCodes
            ? JSON.parse(serviceablePostalCodes)
            : [],
            returnPolicy:
            returnPolicy || "",
            isActive: true
        });

        return res.status(201).json({
            message: "Store created successfully",
            store
        });
    }
    catch (error) {
        await deleteUploadedFiles(req.files);
        return res.status(500).json({
            message: "Store creation failed",
            error: error.message
        });
    }
}

async function getStore(req, res) {
    try {
        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller) {
            return res.status(404).json({
                message: "Seller not found"
            });
        }

        const store = await Store.findOne({ seller: seller._id });
        if (!store) {
            return res.status(404).json({
                message: "Store not found"
            });
        }

        return res.status(200).json({
            message: "Store fetched successfully",
            store
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function updateStore(req, res) {
    try {
        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller) {
            await deleteUploadedFiles(req.files);
            return res.status(404).json({
                message: "Seller not found"
            });
        }

        const store = await Store.findOne({ seller: seller._id });
        if (!store) {
            await deleteUploadedFiles(req.files);
            return res.status(404).json({
                message: "Store not found"
            });
        }

        const {
            description,
            serviceablePostalCodes,
            returnPolicy
        } = req.body;

        if (description !== undefined) store.description = description;
        if (serviceablePostalCodes) store.serviceablePostalCodes = JSON.parse(serviceablePostalCodes);
        if (returnPolicy !== undefined) store.returnPolicy = returnPolicy;

        if (req.files?.logo?.[0]) {
            await deleteFileByUrl(store.logoUrl);
            store.logoUrl = req.files.logo[0].location;
        }

        if (req.files?.banner?.[0]) {
            await deleteFileByUrl(store.bannerUrl);
            store.bannerUrl = req.files.banner[0].location;
        }

        await store.save();
        return res.status(200).json({
            message: "Store updated successfully",
            store
        });
    }

    catch (error) {
        await deleteUploadedFiles(req.files);
        return res.status(500).json({
            message: "Update failed",
            error: error.message
        });
    }
}

module.exports = {
    createStore,
    getStore,
    updateStore
};