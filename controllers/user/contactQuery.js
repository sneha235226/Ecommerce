const ContactQuery = require("../../models/ContactQuery")
const Product = require("../../models/Product")

async function createQuery(req, res) {
    try {
        const { productId, subject, message, phone, email } = req.body
        if (!productId || !message || !phone || !email) {
            return res.status(400).json({
                message: "productId, message, phone, email required"
            })
        }
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            })
        }

        const query = await ContactQuery.create({
            user: req.user._id,
            phone,
            email,
            product: product._id,
            seller: product.seller,
            store: product.store,
            subject,
            message
        })
        return res.status(201).json({
            message: "Query submitted successfully",
            query
        })
    }
    catch (error) {
        return res.status(500).json({
            message: "Create failed",
            error: error.message
        })
    }
}

async function getMyQueries(req, res) {
    try {
        const queries = await ContactQuery.find({
            user: req.user._id
        }).populate("product", "title images")
            .sort({ createdAt: -1 })
        return res.status(200).json({
            message: "Queries fetched successfully",
            queries
        })
    }
    catch (error) {
        return res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

async function getQueryById(req, res) {
    try {
        const query = await ContactQuery.findOne({
            _id: req.params.queryId,
            user: req.user._id
        }).populate("product", "title images")
        if (!query) return res.status(404).json({ message: "Query not found" })
        return res.status(200).json({ query })
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed", error: error.message })
    }
}


module.exports = {
    createQuery,
    getMyQueries,
    getQueryById
};