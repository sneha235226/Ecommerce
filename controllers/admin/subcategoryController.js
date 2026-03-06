const Subcategory = require("../../models/Subcategory");
const Product = require("../../models/Product");
const { s3Client } = require("../../config/s3");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const Category = require("../../models/Category");

function generateSlug(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

async function deleteFileByUrl(url) {
    if (!url) return;
    const key = url.split(".amazonaws.com/")[1];
    if (!key) return;
    await s3Client.send(
        new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        })
    );
}

async function createSubcategory(req, res) {
    try {
        const { name, category } = req.body;
        if (!name || !category) {
            return res.status(400).json({
                message: "name and category required"
            });
        }

        let slug = generateSlug(name);
        let counter = 1;
        while (await Subcategory.findOne({ slug })) {
            slug = `${slug}-${counter++}`;
        }

        const subcategory = await Subcategory.create({
            name,
            slug,
            category,
            imageUrl: req.file?.location || ""
        });

        res.status(201).json({
            message: "Subcategory created successfully",
            subcategory
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Creation failed",
            error: error.message
        });
    }
}

async function getSubcategories(req, res) {
    try {
        const subcategories = await Subcategory.find().populate("category", "name");
        res.json({
            count: subcategories.length,
            subcategories
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function getSubcategoryById(req, res) {
    try {
        const subcategory =
            await Subcategory
                .findById(req.params.id)
                .populate("category", "name");
        if (!subcategory) {
            return res.status(404).json({
                message: "Subcategory not found"
            });
        }
        res.json({ subcategory });
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function updateSubcategory(req, res) {
    try {
        const subcategory = await Subcategory.findById(req.params.id);
        if (!subcategory) {
            return res.status(404).json({
                message: "Subcategory not found"
            });
        }

        const { name, category } = req.body;
        if (name) {
            subcategory.name = name;
            subcategory.slug = generateSlug(name);
        }

        if (category) {
            const categoryExists = await Category.findById(category);
            if (!categoryExists) {
                return res.status(400).json({
                    message: "Invalid category ID"
                });
            }
            subcategory.category = category;
        }

        if (req.file) {
            await deleteFileByUrl(subcategory.imageUrl);
            subcategory.imageUrl = req.file.location;
        }

        await subcategory.save();
        res.json({
            message: "Subcategory updated successfully",
            subcategory
        });
    }

    catch (error) {
        res.status(500).json({
            message: "Patch failed",
            error: error.message
        });
    }
}

async function toggleSubcategory(req, res) {
    try {
        const subcategory = await Subcategory.findById(req.params.id);
        if (!subcategory) {
            return res.status(404).json({
                message: "Subcategory not found"
            });

        }

        subcategory.isActive = !subcategory.isActive;
        await subcategory.save();

        if (subcategory.isActive === false) {
            await Product.updateMany(
                { subcategory: subcategory._id },
                { isActive: false }
            );

        }
        res.json({
            message: "Status updated successfully",
            isActive: subcategory.isActive
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Toggle failed",
            error: error.message
        });
    }
}

module.exports = {
    createSubcategory,
    updateSubcategory,
    getSubcategories,
    getSubcategoryById,
    toggleSubcategory
};