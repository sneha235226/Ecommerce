const Product = require("../../models/Product");

// Translates the frontend toggle to a sellerMode filter.
// mode=retail    → retail + hybrid sellers
// mode=wholesale → wholesale + hybrid sellers
// (no mode)      → all products
function getModeFilter(mode) {
    if (mode === "wholesale") return { sellerMode: { $in: ["wholesale", "hybrid"] } };
    if (mode === "retail") return { sellerMode: { $in: ["retail", "hybrid"] } };
    return {};
}

async function getProducts(req, res) {
    try {
        const { mode, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter = { isActive: true, ...getModeFilter(mode) };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords"),
            Product.countDocuments(filter)
        ]);

        return res.status(200).json({
            message: "Products fetched successfully",
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
            products
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch products", error: error.message });
    }
}

async function getProductById(req, res) {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: "Product ID required" });

        const product = await Product.findOne({ _id: id, isActive: true });
        if (!product) return res.status(404).json({ message: "Product not found" });

        return res.status(200).json({ message: "Product fetched successfully", product });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch product", error: error.message });
    }
}

async function getProductBySubcategory(req, res) {
    try {
        const { subcategory } = req.params;
        const { mode, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter = { subcategory, isActive: true, ...getModeFilter(mode) };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords"),
            Product.countDocuments(filter)
        ]);

        return res.status(200).json({
            message: "Products fetched successfully",
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
            products
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch products", error: error.message });
    }
}

async function getProductBySpecificStore(req, res) {
    try {
        const { store } = req.params;
        const { mode, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter = { store, isActive: true, ...getModeFilter(mode) };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords"),
            Product.countDocuments(filter)
        ]);

        return res.status(200).json({
            message: "Products fetched successfully",
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
            products
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch products", error: error.message });
    }
}

module.exports = {
    getProductById,
    getProducts,
    getProductBySubcategory,
    getProductBySpecificStore
};
