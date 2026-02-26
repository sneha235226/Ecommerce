const Product = require("../../models/Product");
const Store = require("../../models/Store");
const Seller = require("../../models/Seller");
const Category = require("../../models/Category");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../config/s3");
const { v4: uuidv4 } = require("uuid");

function generateSlug(title) {
    return title.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function generateSku(prefix = "PRD") {
    return `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`
}

async function deleteS3Files(files) {
    if (!files?.length) return
    for (const f of files) {
        if (!f?.key) continue
        try {
            await s3.send(
                new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: f.key
                })
            )
            // console.log("Deleted:", f.key)
        } catch (err) {
            // console.log("Delete failed:", f.key)
        }
    }
}
function extractKeysFromUrls(urls = []) {
    return urls
        .filter(Boolean)
        .map(url => {
            try {
                const parsedUrl = new URL(url)
                return {
                    key: parsedUrl.pathname.substring(1)
                }
            } catch (err) {
                return null
            }
        })
        .filter(Boolean)
}

function groupVariantImages(files) {
    const result = {}
    files.forEach(f => {
        const match = f.fieldname.match(/variantImages\[(.*)\]/)
        if (match) {
            const sku = match[1]
            if (!result[sku]) result[sku] = []
            result[sku].push(f.location)
        }
    })
    return result
}

// Only allow creating product if seller is approved and has an active store. Also handle variants and bulk pricing.
async function createProduct(req, res) {
    try {
        const {
            title,
            description,
            shortDescription,
            category,
            subcategory,
            brand,
            tags,
            searchKeywords,
            targetAudience,
            sellerMode,
            moq,
            bulkPricing,
            basePrice,
            totalStock,
            discountPercent,
            taxRatePercent,
            returnPolicy,
            specifications
        } = req.body


        if (!title || !category) {
            await deleteS3Files(req.files)
            return res.status(400).json({
                message: "Title and category required"
            })

        }

        const seller = await Seller.findOne({
            user: req.user._id
        })

        if (!seller || seller.status !== "approved") {
            await deleteS3Files(req.files)
            return res.status(403).json({
                message: "Seller not approved"
            })
        }

        const store = await Store.findOne({
            seller: seller._id,
            isActive: true
        })

        if (!store) {
            await deleteS3Files(req.files)
            return res.status(400).json({
                message: "Active store required"
            })
        }

        let variants = []
        if (req.body.variants) {
            try {
                variants = JSON.parse(req.body.variants)
            }
            catch (e) {
                await deleteS3Files(req.files)
                return res.status(400).json({
                    message: "Invalid variants",
                    error: e.message
                })
            }
        }

        if (variants.length === 0 && (!basePrice || !totalStock)) {
            await deleteS3Files(req.files)
            return res.status(400).json({
                message: "basePrice & totalStock required"
            })
        }

        // console.log("FILES =", req.files);

        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            await deleteS3Files(req.files);
            return res.status(400).json({ message: "Invalid category" });
        }

        let slugBase = generateSlug(title)
        let slug = slugBase
        let i = 1

        while (await Product.findOne({ store: store._id, slug })) {
            slug = `${slugBase}-${i++}`
        }

        const images = req.files
            ?.filter(f => f.fieldname === "images")
            .map(f => f.location) || []


        const videos = req.files
            ?.filter(f => f.fieldname === "videos")
            .map(f => f.location) || []


        const variantFiles = req.files
            ?.filter(f => f.fieldname.startsWith("variantImages[")) || []


        const groupedImages = groupVariantImages(variantFiles)

        const safeVariants = variants.map(v => ({
            sku: v.sku || generateSku("VAR"),
            title: v.title,
            price: Number(v.price),
            stock: Number(v.stock) || 0,
            color: v.color || "",
            size: v.size || "",
            compareAtPrice: v.compareAtPrice || null,
            costPrice: v.costPrice || null,
            attributes: v.attributes || [],
            images: groupedImages[v.sku] || []
        }))

        const product = await Product.create({
            store: store._id,
            seller: seller._id,
            category,
            subcategory: subcategory || null,
            title: title.trim(),
            slug,
            description: description || "",
            shortDescription: shortDescription || "",
            brand: brand || "",
            tags: tags ? JSON.parse(tags) : [],
            searchKeywords: searchKeywords ? JSON.parse(searchKeywords) : [],
            baseSku: generateSku(),
            basePrice: variants.length === 0
                ? Number(basePrice)
                : undefined,
            totalStock: variants.length === 0
                ? Number(totalStock)
                : undefined,
            images,
            videos,
            variants: safeVariants,
            targetAudience,
            sellerMode,
            moq: Number(moq) || 1,
            bulkPricing: bulkPricing
                ? JSON.parse(bulkPricing)
                : [],
            specifications: specifications
                ? JSON.parse(specifications)
                : [],
            discountPercent: Number(discountPercent) || 0,
            taxRatePercent: Number(taxRatePercent) || 0,
            returnPolicy: returnPolicy || "",
            isPublished: false,
            isActive: true
        })
        return res.status(201).json({
            message: "Product created successfully",
            product
        })
    }
    catch (error) {
        await deleteS3Files(req.files)
        return res.status(500).json({
            message: "Failed to create product",
            error: error.message
        })
    }
}

// update product
async function updateProduct(req, res) {
    try {
        const { id } = req.params
        const seller = await Seller.findOne({
            user: req.user._id
        })

        if (!seller) {
            await deleteS3Files(req.files)
            return res.status(404).json({
                message: "Seller not found"
            })
        }

        const product = await Product.findOne({
            _id: id,
            seller: seller._id
        })

        if (!product) {
            await deleteS3Files(req.files)
            return res.status(404).json({
                message: "Product not found"
            })
        }

        const {
            title,
            description,
            shortDescription,
            brand,
            tags,
            searchKeywords,
            targetAudience,
            sellerMode,
            moq,
            discountPercent,
            taxRatePercent,
            returnPolicy
        } = req.body


        if (title) {
            product.title = title.trim()
            let slugBase = generateSlug(title)
            let slug = slugBase
            let i = 1

            while (await Product.findOne({ store: product.store, slug, _id: { $ne: product._id } })) {
                slug = `${slugBase}-${i++}`
            }
            product.slug = slug
        }

        if (description !== undefined)
            product.description = description

        if (shortDescription !== undefined)
            product.shortDescription = shortDescription

        if (brand !== undefined)
            product.brand = brand

        if (tags)
            product.tags = JSON.parse(tags)

        if (searchKeywords)
            product.searchKeywords = JSON.parse(searchKeywords)

        if (targetAudience)
            product.targetAudience = targetAudience

        if (sellerMode)
            product.sellerMode = sellerMode

        if (moq)
            product.moq = Number(moq)

        if (discountPercent !== undefined)
            product.discountPercent = Number(discountPercent)

        if (taxRatePercent !== undefined)
            product.taxRatePercent = Number(taxRatePercent)

        if (returnPolicy !== undefined)
            product.returnPolicy = returnPolicy


        const newImages =
            req.files?.filter(f => f.fieldname === "images")
            .map(f => f.location) || []

        const newVideos =
            req.files?.filter(f => f.fieldname === "videos")
            .map(f => f.location) || []

        product.images.push(...newImages)
        product.videos.push(...newVideos)

        let variants = product.variants

        if (req.body.variants) {
            variants = JSON.parse(req.body.variants)
        }

        const variantFiles =
            req.files?.filter(f =>
                f.fieldname.startsWith("variantImages[")
            ) || []

        const groupedImages =
            groupVariantImages(variantFiles)


        const safeVariants =
            variants.map(v => {
                const oldVariant =
                    product.variants.find(
                        x => x.sku === v.sku
                    )
                return {
                    sku: v.sku,
                    title: v.title,
                    price: Number(v.price),
                    stock: Number(v.stock) || 0,
                    color: v.color || "",
                    size: v.size || "",
                    compareAtPrice: v.compareAtPrice || null,
                    costPrice: v.costPrice || null,
                    attributes: v.attributes || [],
                    images: [
                        ...(oldVariant?.images || []),
                        ...(groupedImages[v.sku] || [])
                    ]
                }
            })

        product.variants = safeVariants

        if (req.body.bulkPricing) {
            product.bulkPricing =
                JSON.parse(req.body.bulkPricing)
        }

        if (req.body.specifications) {
            product.specifications =
                JSON.parse(req.body.specifications)
        }


        await product.save()
        return res.status(200).json({
            message: "Product updated successfully",
            product
        })
    }
    catch (error) {
        await deleteS3Files(req.files)
        return res.status(500).json({
            message: "Failed to update product",
            error: error.message
        })
    }
}

// delete product with all files and data
async function deleteProduct(req, res) {
    try {
        const { id } = req.params
        const seller = await Seller.findOne({
            user: req.user._id
        })

        if (!seller) {
            return res.status(404).json({
                message: "Seller not found"
            })
        }

        const product = await Product.findOne({
            _id: id,
            seller: seller._id
        })
        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            })
        }

        const keys = [
            ...extractKeysFromUrls(product.images),
            ...extractKeysFromUrls(product.videos),
            ...product.variants.flatMap(v =>
                extractKeysFromUrls(v.images)
            )
        ]
        // console.log("Deleting files:", keys)
        await deleteS3Files(keys)
        await Product.deleteOne({ _id: id })
        res.json({
            message: "Product deleted successfully"
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Delete failed",
            error: error.message
        })
    }
}

// Get all products with pagination
async function getAllMyProducts(req, res) {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller) {
            return res.status(404).json({
                message: "Seller not found"
            });
        }

        const [products, total] = await Promise.all([
            Product.find({ seller: seller._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            Product.countDocuments({
                seller: seller._id
            })
        ]);

        return res.status(200).json({
            message: "Products fetched successfully",
            totalProducts: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            limit,
            products
        });
    }

    catch (error) {
        return res.status(500).json({
            message: "Failed to fetch products",
            error: error.message
        });
    }
}

// get single product by id, only if it belongs to the seller
async function getProductById(req, res) {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({
                message: "Product ID required"
            })
        }
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            })
        }
        return res.status(200).json({
            message: "Product fetched successfully",
            product
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch product",
            error: error.message
        })
    }
}


module.exports = {
    createProduct,
    updateProduct,
    deleteProduct,
    getAllMyProducts,
    getProductById
}