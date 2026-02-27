const Product = require("../../models/Product");

async function getProducts(req, res) {
    try {
        const products = await Product.find({isActive: true});
        return res.status(200).json({
            message: "Products fetched successfully",
            products
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch products",
            error: error.message
        })
    }
}

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

async function getProductBySubcategory(req, res) {
    try {
        const subcategory = req.params.subcategory;
        if (!subcategory) {
            return res.status(400).json({
                message: "Subcategory required"
            })
        }
        const products = await Product.find({ subcategory, isActive: true });
        return res.status(200).json({
            message: "Products fetched successfully",
            products
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch products",
            error: error.message
        })
    }
}

async function getProductBySpecificStore(req, res) {
    try {
        const store = req.params.store;
        if (!store) {
            return res.status(400).json({
                message: "Store required"
            })
        }
        const products = await Product.find({ store, isActive: true });
        return res.status(200).json({
            message: "Products fetched successfully",
            products
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch products",
            error: error.message
        })
    }
}

module.exports = {
    getProductById,
    getProducts,
    getProductBySubcategory,
    getProductBySpecificStore
}
