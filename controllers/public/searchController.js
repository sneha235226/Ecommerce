const { searchProducts, suggestProducts } = require("../../services/elasticsearchService");
const { resolveUrl } = require("../../config/s3");
const AdminSettings = require("../../models/AdminSettings");

// GET /api/public/search?q=...&page=1&limit=20&mode=retail|wholesale&minPrice=100&maxPrice=5000&categoryId=...&storeId=...
//   mode=retail    → B2C + "both" products  (default when omitted: all products)
//   mode=wholesale → B2B + "both" products  (blocked when wholesaleEnabled=false)
async function search(req, res) {
    try {
        const {
            q,
            page  = 1,
            limit = 20,
            mode,
            minPrice,
            maxPrice,
            categoryId,
            storeId
        } = req.query;

        if (!q || q.trim().length < 1) {
            return res.status(400).json({ message: "Query parameter 'q' is required" });
        }

        if (mode === "wholesale") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled)
                return res.status(403).json({ message: "Wholesale is currently disabled" });
        }

        const results = await searchProducts(q.trim(), {
            page:  Math.max(1, parseInt(page) || 1),
            limit: Math.min(50, Math.max(1, parseInt(limit) || 20)),
            mode,
            minPrice,
            maxPrice,
            categoryId,
            storeId
        });

        // Resolve presigned URLs for the first image of each product
        await Promise.all(
            results.products.map(async (p) => {
                if (p.images?.length) {
                    p.images[0] = await resolveUrl(p.images[0]).catch(() => p.images[0]);
                }
            })
        );

        return res.status(200).json({
            message:    "Search results",
            query:      q.trim(),
            page:       results.page,
            limit:      results.limit,
            total:      results.total,
            totalPages: results.totalPages,
            products:   results.products
        });
    } catch (error) {
        const detail = error.message || error.meta?.body?.error?.reason || "Elasticsearch unavailable";
        console.error("[Search] error:", detail);
        return res.status(500).json({ message: "Search failed", error: detail });
    }
}

// GET /api/public/search/suggest?q=...&mode=retail|wholesale
async function suggest(req, res) {
    try {
        const { q, mode } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(200).json({ suggestions: [] });
        }

        const suggestions = await suggestProducts(q.trim(), { mode });

        // Resolve first image for each suggestion
        await Promise.all(
            suggestions.map(async (s) => {
                if (s.image) {
                    s.image = await resolveUrl(s.image).catch(() => s.image);
                }
            })
        );

        return res.status(200).json({ suggestions });
    } catch (error) {
        const detail = error.message || error.meta?.body?.error?.reason || "Elasticsearch unavailable";
        console.error("[Suggest] error:", detail);
        return res.status(500).json({ message: "Suggestion failed", error: detail });
    }
}

module.exports = { search, suggest };
