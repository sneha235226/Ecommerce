const Store = require("../../models/Store");
const Product = require("../../models/Product");
const AdminSettings = require("../../models/AdminSettings");
const { resolveStoreImages, resolveProductImages } = require("../../config/s3");

// Used in $geoNear query on the Store collection.
// store.sellerMode is denormalized from seller.mode — tells us what type of store it is.
//   retail    → carries B2C products
//   wholesale → carries B2B products
//   hybrid    → carries both
function getStoreModeFilter(mode) {
    if (mode === "wholesale") return ["wholesale", "hybrid"];
    return ["retail", "hybrid"]; // default = retail
}

// Used when querying the Product collection.
// Toggle filters by targetAudience — who the product is intended for.
//   "both" products appear in BOTH retail and wholesale modes.
function getProductAudienceFilter(mode) {
    if (mode === "wholesale") return ["B2B", "both"];
    return ["B2C", "both"]; // default = retail
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

        if (!settings.nearbyStoresEnabled) {
            return res.status(403).json({ message: "Nearby stores feature is currently disabled" });
        }

        if (mode === "wholesale" && !settings.wholesaleEnabled) {
            return res.status(403).json({ message: "Wholesale is currently disabled" });
        }

        const radiusMeters = settings.nearbyStoreRadiusKm * 1000;
        const storeModeFilter = getStoreModeFilter(mode);
        const skip = (Number(page) - 1) * Number(limit);

        // $geoNear must be the first stage in the aggregation pipeline.
        // Filters by maxDistance + store.sellerMode simultaneously — single index scan.
        const stores = await Store.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "distanceMeters",
                    maxDistance: radiusMeters,
                    spherical: true,
                    query: {
                        isActive: true,
                        sellerMode: { $in: storeModeFilter }
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
                        { $project: { businessName: 1, ratingAverage: 1, ratingCount: 1, businessAddress: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
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
                    distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },
                    location: 1
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
                        sellerMode: { $in: storeModeFilter }
                    }
                }
            },
            { $count: "total" }
        ]);

        const total = totalResult[0]?.total || 0;

        await Promise.all(stores.map(resolveStoreImages));

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

        if (!settings.nearbyStoresEnabled) {
            return res.status(403).json({ message: "Nearby stores feature is currently disabled" });
        }

        if (mode === "wholesale" && !settings.wholesaleEnabled) {
            return res.status(403).json({ message: "Wholesale is currently disabled" });
        }

        const radiusMeters = settings.nearbyStoreRadiusKm * 1000;
        const storeModeFilter = getStoreModeFilter(mode);
        const audienceFilter = getProductAudienceFilter(mode);
        const skip = (Number(page) - 1) * Number(limit);

        // Step 1: get nearby store IDs filtered by store type (lightweight — only _id)
        const nearbyStores = await Store.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "d",
                    maxDistance: radiusMeters,
                    spherical: true,
                    query: { isActive: true, sellerMode: { $in: storeModeFilter } }
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

        // Step 2: query products by targetAudience — who can see these products
        // "both" products appear in both retail and wholesale mode
        const productFilter = {
            store: { $in: storeIds },
            isActive: true,
            targetAudience: { $in: audienceFilter }
        };

        const [products, total] = await Promise.all([
            Product.find(productFilter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bulkPricing -specifications -searchKeywords"),
            Product.countDocuments(productFilter)
        ]);

        await Promise.all(products.map(resolveProductImages));

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

module.exports = { getNearbyStores, getNearbyStoreProducts };
