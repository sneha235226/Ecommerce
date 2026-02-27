const Review = require("../../models/Review");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const Store = require("../../models/Store");

const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../config/s3");


function extractKeysFromUrls(urls = []) {

    return urls.map(url => ({
        key: url.split(".amazonaws.com/")[1]
    }))

}


async function deleteS3Files(files) {
    if (!files || !files.length) return;
    try {
        for (const f of files) {
            if (!f.key) continue;
            await s3.send(
                new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: f.key
                })
            )
        }
    }
    catch (err) {
        console.error("S3 delete error:", err.message)
    }
}


async function updateAverageRatings(review) {
    if (review.product) {
        const stats = await Review.aggregate([
            { $match: { product: review.product } },
            {
                $group: {
                    _id: null,
                    avg: { $avg: "$rating" },
                    count: { $sum: 1 }
                }
            }
        ])

        if (stats.length) {
            await Product.findByIdAndUpdate(review.product, {
                ratingAverage: stats[0].avg,
                ratingCount: stats[0].count
            })
        }
    }
    if (review.seller) {
        const stats = await Review.aggregate([
            { $match: { seller: review.seller } },
            {
                $group: {
                    _id: null,
                    avg: { $avg: "$rating" },
                    count: { $sum: 1 }
                }
            }
        ])
        if (stats.length) {
            await Seller.findByIdAndUpdate(review.seller, {
                ratingAverage: stats[0].avg,
                ratingCount: stats[0].count
            })
        }
    }

    if (review.store) {
        const stats = await Review.aggregate([
            { $match: { store: review.store } },
            {
                $group: {
                    _id: null,
                    avg: { $avg: "$rating" },
                    count: { $sum: 1 }
                }
            }
        ])
        if (stats.length) {
            await Store.findByIdAndUpdate(review.store, {
                ratingAverage: stats[0].avg,
                ratingCount: stats[0].count
            })
        }
    }
}

async function createReview(req, res) {
    let images = []
    if (req.files) {
        images = req.files.map(f => f.location)
    }

    try {
        const body = req.body || {};
        const {
            reviewType,
            product,
            seller,
            store,
            order,
            rating,
            title,
            comment
        } = body;

        if (!order || !rating || !reviewType) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({
                message: "order, rating & reviewType required"
            })
        }

        if (reviewType === "product" && !product) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({ message: "product id required for product review" })
        }
        if (reviewType === "seller" && !seller) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({ message: "seller id required for seller review" })
        }
        if (reviewType === "store" && !store) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({ message: "store id required for store review" })
        }


        const orderData = await Order.findOne({
            _id: order,
            user: req.user._id
        })


        if (!orderData) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({
                message: "Invalid order"
            })
        }


        let allowed = false;

        if (reviewType === "product") {
            const item = orderData.items.find(i =>
                String(i.product) === String(product) &&
                (i.status === "delivered" || orderData.status === "delivered")
            )
            if (!item) {
                await deleteS3Files(extractKeysFromUrls(images))
                return res.status(400).json({
                    message: "Product must be delivered before you can review it"
                })
            }
            allowed = true
        }

        if (reviewType === "store") {
            const item = orderData.items.find(i =>
                String(i.store) === String(store) &&
                (i.status === "delivered" || orderData.status === "delivered")
            )
            if (!item) {
                await deleteS3Files(extractKeysFromUrls(images))
                return res.status(400).json({
                    message: "Store items must be delivered before you can review"
                })
            }
            allowed = true
        }

        if (reviewType === "seller") {
            const item = orderData.items.find(i =>
                String(i.seller) === String(seller) &&
                (i.status === "delivered" || orderData.status === "delivered")
            )

            if (!item) {
                await deleteS3Files(extractKeysFromUrls(images))
                return res.status(400).json({
                    message: "Seller items must be delivered before you can review"
                })
            }
            allowed = true
        }

        if (!allowed) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({
                message: "Invalid reviewType"
            })
        }

        const duplicateQuery = { user: req.user._id, reviewType }
        if (reviewType === "product") duplicateQuery.product = product
        if (reviewType === "seller") duplicateQuery.seller = seller
        if (reviewType === "store") duplicateQuery.store = store

        const existing = await Review.findOne(duplicateQuery)
        if (existing) {
            await deleteS3Files(extractKeysFromUrls(images))
            return res.status(400).json({
                message: "You have already reviewed this " + reviewType
            })
        }


        const review =
            await Review.create({
                reviewType,
                product: reviewType === "product" ? product : null,
                seller: reviewType === "seller" ? seller : null,
                store: reviewType === "store" ? store : null,
                user: req.user._id,
                order,
                rating,
                title,
                comment,
                images
            })

        await updateAverageRatings(review)
        res.status(201).json({
            message: "Review created",
            review
        })
    }
    catch (error) {
        await deleteS3Files(extractKeysFromUrls(images))
        res.status(500).json({
            message: "Create failed",
            error: error.message
        })
    }
}

async function getProductReviews(req, res) {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const skip = (page - 1) * limit


        const query = {
            product: req.params.id
        }


        const reviews = await Review.find(query)
            .populate("user", "firstName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await Review.countDocuments(query)

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            reviews
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

async function getStoreReviews(req, res) {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const skip = (page - 1) * limit
        const query = {
            store: req.params.id
        }
        const reviews = await Review.find(query)
            .populate("user", "firstName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await Review.countDocuments(query)
        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            reviews
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

async function getSellerReviews(req, res) {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const skip = (page - 1) * limit
        const query = {
            seller: req.params.id
        }

        const reviews = await Review.find(query)
            .populate("user", "firstName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await Review.countDocuments(query)

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            reviews
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

async function deleteReview(req, res) {
    try {
        const { id } = req.params
        const review = await Review.findOne({
                _id: id,
                user: req.user._id
            })

        if (!review) {
            return res.status(404).json({
                message: "Review not found or not yours"
            })
        }


        if (review.images?.length) {
            await deleteS3Files(
                extractKeysFromUrls(review.images)
            )
        }

        await Review.deleteOne({
            _id: review._id
        })

        await updateAverageRatings(review)
        res.json({
            message: "Review deleted successfully",
            deletedReviewType: review.reviewType,
            targetId:
                review.product ||
                review.store ||
                review.seller
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Delete failed",
            error: error.message
        })
    }
}

module.exports = { createReview, getProductReviews, getStoreReviews, getSellerReviews, deleteReview }