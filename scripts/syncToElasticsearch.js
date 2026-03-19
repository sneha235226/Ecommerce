/**
 * One-time bulk sync: indexes all existing MongoDB products into Elasticsearch.
 * Run with: node scripts/syncToElasticsearch.js
 *
 * Safe to re-run — uses upsert (doc_as_upsert: true).
 */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { client, INDEX, ensureIndex } = require("../config/elasticsearch");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");

const BATCH_SIZE = 100;

async function run() {
    await connectDB();
    console.log("MongoDB connected");

    await ensureIndex();
    console.log(`ES index "${INDEX}" ready`);

    // Build lookup maps for category/subcategory names
    const [categories, subcategories] = await Promise.all([
        Category.find({}, "name").lean(),
        Subcategory.find({}, "name").lean()
    ]);

    const catMap = {};
    categories.forEach(c => { catMap[c._id.toString()] = c.name; });

    const subMap = {};
    subcategories.forEach(s => { subMap[s._id.toString()] = s.name; });

    const total = await Product.countDocuments({});
    console.log(`Syncing ${total} products...`);

    let indexed = 0;
    let failed  = 0;
    let page    = 0;

    while (true) {
        const products = await Product.find({})
            .skip(page * BATCH_SIZE)
            .limit(BATCH_SIZE)
            .lean();

        if (products.length === 0) break;

        // Build bulk operations array
        const ops = products.flatMap(p => [
            { update: { _index: INDEX, _id: p._id.toString() } },
            {
                doc: {
                    title:           p.title || "",
                    brand:           p.brand || "",
                    categoryName:    catMap[p.category?.toString()] || "",
                    subcategoryName: subMap[p.subcategory?.toString()] || "",
                    tags:            (p.tags || []).join(" "),
                    searchKeywords:  (p.searchKeywords || []).join(" "),
                    description:     p.description || "",
                    shortDescription:p.shortDescription || "",
                    isActive:        p.isActive ?? true,
                    targetAudience:  p.targetAudience || "B2C",
                    sellerMode:      p.sellerMode || "retail",
                    storeId:         p.store?.toString() || "",
                    categoryId:      p.category?.toString() || "",
                    subcategoryId:   p.subcategory?.toString() || "",
                    basePrice:       p.basePrice || 0,
                    discountPercent: p.discountPercent || 0,
                    ratingAverage:   p.ratingAverage || 0,
                    ratingCount:     p.ratingCount || 0,
                    totalStock:      p.totalStock || 0,
                    slug:            p.slug || "",
                    images:          p.images || [],
                    createdAt:       p.createdAt || new Date()
                },
                doc_as_upsert: true
            }
        ]);

        const { errors, items } = await client.bulk({ operations: ops, refresh: false });

        if (errors) {
            items.forEach(item => {
                if (item.update?.error) {
                    console.error(`  Failed: ${item.update._id} — ${item.update.error.reason}`);
                    failed++;
                } else {
                    indexed++;
                }
            });
        } else {
            indexed += products.length;
        }

        console.log(`  Batch ${page + 1}: ${indexed} indexed, ${failed} failed`);
        page++;
    }

    console.log(`\nSync complete. Indexed: ${indexed}, Failed: ${failed}, Total: ${total}`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
