const Store = require("../../models/Store");
const Product = require("../../models/Product");
const AdminSettings = require("../../models/AdminSettings");

// Translates toggle mode to sellerMode array (mirrors productController)
function getModeFilter(mode) {
    if (mode === "wholesale") return ["wholesale", "hybrid"];
    return ["retail", "hybrid"]; // default = retail
}

// GET /api/public/stores/nearby
// Query params: lat, lng, mode (retail|wholesale), page, limit
async function getNearbyStores(req, res) {
    try {
        const { lat, lng, mode, page = 1, limit = 10 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ message: "lat and lng are required" });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ message: "lat and lng must be valid numbers" });
        }

        const settings = await AdminSettings.getSettings();
        const radiusMeters = settings.nearbyStoreRadiusKm * 1000;
        const modeFilter = getModeFilter(mode);
        const skip = (Number(page) - 1) * Number(limit);

        // $geoNear must be the first stage in the aggregation pipeline
        // It filters by maxDistance + query simultaneously — single index scan
        const stores = await Store.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "distanceMeters",
                    maxDistance: radiusMeters,
                    spherical: true,
                    query: {
                        isActive: true,
                        sellerMode: { $in: modeFilter }
                    }
                }
            },
            {
                $lookup: {
                    from: "sellers",
                    localField: "seller",
                    foreignField: "_id",
                    as: "sellerInfo",
                    pipeline: [
                        { $project: { businessName: 1, ratingAverage: 1, ratingCount: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$sellerInfo", preserveNullAndEmpty: true } },
            {
                $project: {
                    _id: 1,
                    seller: 1,
                    sellerInfo: 1,
                    sellerMode: 1,
                    logoUrl: 1,
                    bannerUrl: 1,
                    description: 1,
                    distanceMeters: 1,
                    distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] }
                }
            },
            { $skip: skip },
            { $limit: Number(limit) }
        ]);

        // Count separately (geoNear doesn't support $count in same pipeline easily)
        const totalResult = await Store.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "distanceMeters",
                    maxDistance: radiusMeters,
                    spherical: true,
                    query: {
                        isActive: true,
                        sellerMode: { $in: modeFilter }
                    }
                }
            },
            { $count: "total" }
        ]);

        const total = totalResult[0]?.total || 0;

        return res.status(200).json({
            message: "Nearby stores fetched successfully",
            radiusKm: settings.nearbyStoreRadiusKm,
            mode: mode || "retail",
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
            stores
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch nearby stores", error: error.message });
    }
}

// GET /api/public/stores/nearby/products
// Query params: lat, lng, mode, page, limit
// Returns products from stores within the radius, respecting toggle mode
async function getNearbyStoreProducts(req, res) {
    try {
        const { lat, lng, mode, page = 1, limit = 20 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ message: "lat and lng are required" });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ message: "lat and lng must be valid numbers" });
        }

        const settings = await AdminSettings.getSettings();
        const radiusMeters = settings.nearbyStoreRadiusKm * 1000;
        const modeFilter = getModeFilter(mode);
        const skip = (Number(page) - 1) * Number(limit);

        // Step 1: get nearby store IDs (lightweight — only _id)
        const nearbyStores = await Store.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "d",
                    maxDistance: radiusMeters,
                    spherical: true,
                    query: { isActive: true, sellerMode: { $in: modeFilter } }
                }
            },
            { $project: { _id: 1 } }
        ]);

        if (nearbyStores.length === 0) {
            return res.status(200).json({
                message: "No stores found nearby",
                page: Number(page),
                limit: Number(limit),
                total: 0,
                totalPages: 0,
                products: []
            });
        }

        const storeIds = nearbyStores.map(s => s._id);

        // Step 2: query products in those stores, same mode filter on product
        const productFilter = {
            store: { $in: storeIds },
            isActive: true,
            sellerMode: { $in: modeFilter }
        };

        const [products, total] = await Promise.all([
            Product.find(productFilter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords"),
            Product.countDocuments(productFilter)
        ]);

        return res.status(200).json({
            message: "Products from nearby stores fetched successfully",
            radiusKm: settings.nearbyStoreRadiusKm,
            mode: mode || "retail",
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
            products
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch nearby products", error: error.message });
    }
}

// GET /api/public/stores/:storeId
async function getStoreById(req, res) {
    try {
        const store = await Store.findOne({ _id: req.params.storeId, isActive: true })
            .populate("seller", "businessName ratingAverage ratingCount");

        if (!store) {
            return res.status(404).json({ message: "Store not found" });
        }

        return res.status(200).json({ message: "Store fetched successfully", store });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch store", error: error.message });
    }
}

module.exports = { getNearbyStores, getNearbyStoreProducts, getStoreById };
