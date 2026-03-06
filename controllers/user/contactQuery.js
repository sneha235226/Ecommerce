const ContactQuery = require("../../models/ContactQuery")
const Product = require("../../models/Product")

async function createQuery(req, res) {
    try {
        const { productId, subject, message, phone, email } = req.body
        if (!productId || !message || !phone || !email) {
            return res.status(400).json({
                message: "productId, message, phone, email required"
            })

            const product = await Product.findById(productId)
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
            res.status(201).json({
                message: "Query submitted successfully",
                query
            })
        }
    }
    catch (error) {
        res.status(500).json({
            message: "Create failed",
            error: error.message
        })
    }
}

module.exports = {
    createQuery
}