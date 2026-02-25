const Seller = require("../../models/Seller");
const Store = require("../../models/Store");
const s3 = require("../../config/s3");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");

function generateSlug(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

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
        const { name, description, serviceablePostalCodes, returnPolicy } = req.body;

        if (!name || !name.trim()) {
            await deleteUploadedFiles(req.files);
            return res.status(400).json({
                message: "Store name required"
            });
        }

        const seller = req.seller;

        const existingStore =
        await Store.findOne({
            seller: seller._id
        });

        if (existingStore) {
            await deleteUploadedFiles(req.files);
            return res.status(400).json({
                message: "Store already exists"
            });
        }

        let slug = generateSlug(name);
        let counter = 1;
        while (await Store.findOne({ slug })) {
            slug = `${slug}-${counter++}`;
        }

        const store = await Store.create({
            seller: seller._id,
            name: name.trim(),
            slug,
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
            name,
            description,
            serviceablePostalCodes,
            returnPolicy
        } = req.body;

        if (name) {
            store.name = name.trim();
            store.slug = generateSlug(name);
        }

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

async function deleteStore(req, res) {
    try {
        const seller = await Seller.findOne({
            user: req.user._id
        });

        if (!seller) {
            return res.status(404).json({
                message: "Seller not found"
            });
        }

        const store = await Store.findOne({
            seller: seller._id
        });
        if (!store) {
            return res.status(404).json({
                message: "Store not found"
            });
        }

        await deleteFileByUrl(store.logoUrl);
        await deleteFileByUrl(store.bannerUrl);
        await Store.deleteOne({
            _id: store._id
        });

        return res.status(200).json({
            message: "Store deleted successfully"
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Delete failed",
            error: error.message
        });
    }
}

module.exports = {
    createStore,
    getStore,
    updateStore,
    deleteStore
};