const { searchProducts, suggestProducts } = require("../../services/elasticsearchService");
const { resolveUrl } = require("../../config/s3");

// GET /api/public/search?q=...&page=1&limit=20&targetAudience=B2C&minPrice=100&maxPrice=5000&categoryId=...&storeId=...
async function search(req, res) {
    try {
        const {
            q,
            page = 1,
            limit = 20,
            targetAudience,
            minPrice,
            maxPrice,
            categoryId,
            storeId
        } = req.query;

        if (!q || q.trim().length < 1) {
            return res.status(400).json({ message: "Query parameter 'q' is required" });
        }

        const results = await searchProducts(q.trim(), {
            page:    Math.max(1, parseInt(page) || 1),
            limit:   Math.min(50, Math.max(1, parseInt(limit) || 20)),
            targetAudience,
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
        console.error("[Search] error:", error.message);
        return res.status(500).json({ message: "Search failed", error: error.message });
    }
}

// GET /api/public/search/suggest?q=...
async function suggest(req, res) {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(200).json({ suggestions: [] });
        }

        const suggestions = await suggestProducts(q.trim());

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
        console.error("[Suggest] error:", error.message);
        return res.status(500).json({ message: "Suggestion failed", error: error.message });
    }
}

module.exports = { search, suggest };
