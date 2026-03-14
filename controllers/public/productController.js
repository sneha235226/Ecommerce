const Product = require("../../models/Product");
const AdminSettings = require("../../models/AdminSettings");
const { resolveProductImages } = require("../../config/s3");

// Translates the frontend toggle to a targetAudience filter.
// The toggle controls product VISIBILITY — who the product is intended for.
//   mode=retail    → show products for B2C buyers  (targetAudience: B2C or both)
//   mode=wholesale → show products for B2B buyers  (targetAudience: B2B or both)
//   "both" products always appear in both modes.
//   (no mode)      → show everything
function getModeFilter(mode) {
    if (mode === "wholesale") return { targetAudience: { $in: ["B2B", "both"] } };
    if (mode === "retail") return { targetAudience: { $in: ["B2C", "both"] } };
    return {};
}

async function getProducts(req, res) {
    try {
        const { mode, page = 1, limit = 20 } = req.query;

        if (mode === "wholesale") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled) {
                return res.status(403).json({ message: "Wholesale is currently disabled" });
            }
        }

        const skip = (Number(page) - 1) * Number(limit);
        const filter = { isActive: true, ...getModeFilter(mode) };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("store", "description logoUrl bannerUrl sellerMode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords")
                .lean(),
            Product.countDocuments(filter)
        ]);

        await Promise.all(products.map(resolveProductImages));

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

        const product = await Product.findOne({ _id: id, isActive: true })
            .populate("store", "description logoUrl bannerUrl sellerMode returnPolicy serviceablePostalCodes")
            .lean();
        if (!product) return res.status(404).json({ message: "Product not found" });

        await resolveProductImages(product);

        return res.status(200).json({ message: "Product fetched successfully", product });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch product", error: error.message });
    }
}

async function getProductBySubcategory(req, res) {
    try {
        const { subcategory } = req.params;
        const { mode, page = 1, limit = 20 } = req.query;

        if (mode === "wholesale") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled) {
                return res.status(403).json({ message: "Wholesale is currently disabled" });
            }
        }

        const skip = (Number(page) - 1) * Number(limit);
        const filter = { subcategory, isActive: true, ...getModeFilter(mode) };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("store", "description logoUrl bannerUrl sellerMode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords")
                .lean(),
            Product.countDocuments(filter)
        ]);

        await Promise.all(products.map(resolveProductImages));

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

        if (mode === "wholesale") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled) {
                return res.status(403).json({ message: "Wholesale is currently disabled" });
            }
        }

        const skip = (Number(page) - 1) * Number(limit);
        const filter = { store, isActive: true, ...getModeFilter(mode) };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("store", "description logoUrl bannerUrl sellerMode returnPolicy serviceablePostalCodes")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords")
                .lean(),
            Product.countDocuments(filter)
        ]);

        await Promise.all(products.map(resolveProductImages));

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
