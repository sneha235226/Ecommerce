const crypto = require("crypto");

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

module.exports = { generateOrderNumber, deriveOrderStatus };
