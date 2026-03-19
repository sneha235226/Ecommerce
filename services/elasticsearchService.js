const { client, INDEX } = require("../config/elasticsearch");

// Shape a MongoDB product doc into an ES document
function buildDoc(product, categoryName = "", subcategoryName = "") {
    return {
        title:           product.title || "",
        brand:           product.brand || "",
        categoryName:    categoryName || "",
        subcategoryName: subcategoryName || "",
        tags:            (product.tags || []).join(" "),
        searchKeywords:  (product.searchKeywords || []).join(" "),
        description:     product.description || "",
        shortDescription:product.shortDescription || "",
        isActive:        product.isActive ?? true,
        targetAudience:  product.targetAudience || "B2C",
        sellerMode:      product.sellerMode || "retail",
        storeId:         product.store?.toString() || "",
        categoryId:      product.category?.toString() || "",
        subcategoryId:   product.subcategory?.toString() || "",
        basePrice:       product.basePrice || 0,
        discountPercent: product.discountPercent || 0,
        ratingAverage:   product.ratingAverage || 0,
        ratingCount:     product.ratingCount || 0,
        totalStock:      product.totalStock || 0,
        slug:            product.slug || "",
        images:          product.images || [],
        createdAt:       product.createdAt || new Date()
    };
}

// Index a new product
async function indexProduct(product, categoryName = "", subcategoryName = "") {
    try {
        await client.index({
            index: INDEX,
            id:    product._id.toString(),
            document: buildDoc(product, categoryName, subcategoryName)
        });
    } catch (err) {
        console.error("[ES] indexProduct failed:", err.message);
    }
}

// Update an existing product in the index
async function updateProductIndex(product, categoryName = "", subcategoryName = "") {
    try {
        await client.update({
            index: INDEX,
            id:    product._id.toString(),
            doc:   buildDoc(product, categoryName, subcategoryName),
            doc_as_upsert: true
        });
    } catch (err) {
        console.error("[ES] updateProductIndex failed:", err.message);
    }
}

// Remove a product from the index
async function deleteProductFromIndex(productId) {
    try {
        await client.delete({ index: INDEX, id: productId.toString() });
    } catch (err) {
        if (err.meta?.statusCode !== 404) {
            console.error("[ES] deleteProductFromIndex failed:", err.message);
        }
    }
}

// Main search — fuzzy + partial match across all key fields
async function searchProducts(query, { page = 1, limit = 20, mode, minPrice, maxPrice, categoryId, storeId } = {}) {
    const from = (page - 1) * limit;

    // Build optional filters
    const filters = [{ term: { isActive: true } }];

    // mode filter — mirrors getModeFilter() in productController:
    //   retail    → targetAudience is "B2C" or "both"
    //   wholesale → targetAudience is "B2B" or "both"
    //   (absent)  → no filter (show everything)
    if (mode === "retail")     filters.push({ terms: { targetAudience: ["B2C", "both"] } });
    else if (mode === "wholesale") filters.push({ terms: { targetAudience: ["B2B", "both"] } });

    if (categoryId) filters.push({ term: { categoryId } });
    if (storeId)    filters.push({ term: { storeId } });
    if (minPrice !== undefined || maxPrice !== undefined) {
        const range = {};
        if (minPrice !== undefined) range.gte = Number(minPrice);
        if (maxPrice !== undefined) range.lte = Number(maxPrice);
        filters.push({ range: { basePrice: range } });
    }

    const esQuery = {
        bool: {
            filter: filters,
            should: [
                // Fuzzy match — handles typos like "iphon" → iPhone
                {
                    multi_match: {
                        query,
                        fields: [
                            "title^5",
                            "brand^3",
                            "categoryName^2",
                            "subcategoryName^2",
                            "tags^2",
                            "searchKeywords^2",
                            "shortDescription",
                            "description^0.5"
                        ],
                        type:         "best_fields",
                        fuzziness:    "AUTO",
                        prefix_length: 1,
                        operator:     "or"
                    }
                },
                // Phrase prefix — handles partial words like "blu tsh" → Blue T-Shirt
                {
                    multi_match: {
                        query,
                        fields: [
                            "title^4",
                            "brand^2",
                            "categoryName",
                            "subcategoryName",
                            "tags",
                            "searchKeywords"
                        ],
                        type:  "phrase_prefix",
                        boost: 1.5
                    }
                }
            ],
            minimum_should_match: 1
        }
    };

    const result = await client.search({
        index: INDEX,
        from,
        size: limit,
        query: esQuery,
        highlight: {
            pre_tags:  ["<mark>"],
            post_tags: ["</mark>"],
            fields: {
                title:       { number_of_fragments: 0 },
                brand:       { number_of_fragments: 0 },
                description: { number_of_fragments: 1, fragment_size: 120 }
            }
        },
        _source: ["title", "brand", "categoryName", "subcategoryName", "tags",
                  "basePrice", "discountPercent", "ratingAverage", "ratingCount",
                  "totalStock", "images", "slug", "isActive", "targetAudience",
                  "storeId", "categoryId", "subcategoryId", "createdAt"]
    });

    const hits  = result.hits.hits;
    const total = typeof result.hits.total === "number"
        ? result.hits.total
        : result.hits.total.value;

    const products = hits.map(hit => ({
        _id:       hit._id,
        score:     hit._score,
        highlight: hit.highlight || {},
        ...hit._source
    }));

    return { products, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Autocomplete suggestions (lightweight — title only, no fuzziness)
async function suggestProducts(query, { mode, limit = 8 } = {}) {
    const filters = [{ term: { isActive: true } }];
    if (mode === "retail")         filters.push({ terms: { targetAudience: ["B2C", "both"] } });
    else if (mode === "wholesale") filters.push({ terms: { targetAudience: ["B2B", "both"] } });

    const result = await client.search({
        index: INDEX,
        size: limit,
        query: {
            bool: {
                filter: filters,
                should: [
                    { match: { title: { query, analyzer: "autocomplete_search" } } },
                    { match: { brand: { query, analyzer: "autocomplete_search" } } }
                ],
                minimum_should_match: 1
            }
        },
        _source: ["title", "brand", "slug", "images"]
    });

    return result.hits.hits.map(hit => ({
        _id:   hit._id,
        title: hit._source.title,
        brand: hit._source.brand,
        slug:  hit._source.slug,
        image: hit._source.images?.[0] || null
    }));
}

module.exports = {
    indexProduct,
    updateProductIndex,
    deleteProductFromIndex,
    searchProducts,
    suggestProducts
};
