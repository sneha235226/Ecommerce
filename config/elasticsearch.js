const { Client } = require("@elastic/elasticsearch");

const INDEX = "products";

const client = new Client({
    node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
    ...(process.env.ELASTICSEARCH_API_KEY && {
        auth: { apiKey: process.env.ELASTICSEARCH_API_KEY }
    })
});

// Index settings — edge n-gram for partial match + standard for search
const INDEX_SETTINGS = {
    analysis: {
        analyzer: {
            autocomplete: {
                type: "custom",
                tokenizer: "autocomplete_tokenizer",
                filter: ["lowercase"]
            },
            autocomplete_search: {
                type: "custom",
                tokenizer: "standard",
                filter: ["lowercase"]
            }
        },
        tokenizer: {
            autocomplete_tokenizer: {
                type: "edge_ngram",
                min_gram: 2,
                max_gram: 20,
                token_chars: ["letter", "digit"]
            }
        }
    }
};

// Field mappings
const INDEX_MAPPINGS = {
    properties: {
        // Searchable text fields — edge n-gram for partial, fuzziness for typos
        title:          { type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search", fields: { keyword: { type: "keyword" } } },
        brand:          { type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search" },
        categoryName:   { type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search" },
        subcategoryName:{ type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search" },
        tags:           { type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search" },
        searchKeywords: { type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search" },
        description:    { type: "text", analyzer: "standard" },
        shortDescription:{ type: "text", analyzer: "standard" },

        // Filter / sort fields
        isActive:        { type: "boolean" },
        targetAudience:  { type: "keyword" },
        sellerMode:      { type: "keyword" },
        storeId:         { type: "keyword" },
        categoryId:      { type: "keyword" },
        subcategoryId:   { type: "keyword" },
        basePrice:       { type: "float" },
        discountPercent: { type: "float" },
        ratingAverage:   { type: "float" },
        ratingCount:     { type: "integer" },
        totalStock:      { type: "integer" },
        createdAt:       { type: "date" },

        // Stored but not indexed (returned in results, never searched)
        slug:   { type: "keyword" },
        images: { type: "keyword", index: false }
    }
};

// Create the index with settings and mappings (idempotent)
async function ensureIndex() {
    try {
        const exists = await client.indices.exists({ index: INDEX });
        if (exists) return;

        await client.indices.create({
            index: INDEX,
            settings: INDEX_SETTINGS,
            mappings: INDEX_MAPPINGS
        });

        console.log(`[ES] Index "${INDEX}" created`);
    } catch (error) {
        console.error("[ES] Failed to create index:", error.message);
    }
}

module.exports = { client, INDEX, ensureIndex };
