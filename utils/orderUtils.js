const crypto = require("crypto");

function getBulkPrice(product, quantity, variantPrice) {
    if (product.bulkPricingEnabled && product.bulkPricing.length) {
        for (const tier of product.bulkPricing) {
            if (quantity >= tier.minQty && (!tier.maxQty || quantity <= tier.maxQty)) {
                return {
                    price: tier.pricePerUnit,
                    appliedTier: { minQty: tier.minQty, maxQty: tier.maxQty, unitPrice: tier.pricePerUnit }
                };
            }
        }
    }
    return { price: variantPrice, appliedTier: null };
}

function generateOrderNumber() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `ORD-${ts}-${rand}`;
}

function deriveOrderStatus(items) {
    const statuses = items.map(i => i.status);
    if (statuses.every(s => s === "delivered")) return "delivered";
    if (statuses.every(s => s === "cancelled" || s === "rejected")) return "cancelled";
    if (statuses.some(s => s === "shipped" || s === "delivered")) return "partially_shipped";
    return "placed";
}

module.exports = { getBulkPrice, generateOrderNumber, deriveOrderStatus };
