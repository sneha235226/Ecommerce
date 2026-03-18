const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const AdminSettings = require("../../models/AdminSettings");
const { getBulkPrice } = require("../../utils/orderUtils");
const { resolveUrl } = require("../../config/s3");

// Derives the effective pricing mode for a single purchase
function resolvePricingMode(sellerMode, appliedTier) {
    if (sellerMode === "hybrid") return appliedTier ? "wholesale" : "retail";
    return sellerMode;
}

function calculateTotals(cart) {
    let subtotal = 0;
    let taxAmount = 0;

    cart.items.forEach(item => {
        item.lineTotal = parseFloat((item.unitPrice * item.quantity).toFixed(2));
        subtotal += item.lineTotal;
        taxAmount += parseFloat((item.lineTotal * (item.taxRatePercent || 0) / 100).toFixed(2));
    });

    cart.subtotal = parseFloat(subtotal.toFixed(2));
    cart.taxAmount = parseFloat(taxAmount.toFixed(2));
    cart.shippingAmount = cart.shippingAmount || 0;
    cart.discountAmount = cart.discountAmount || 0;
    cart.grandTotal = parseFloat(
        (cart.subtotal + cart.shippingAmount + cart.taxAmount - cart.discountAmount).toFixed(2)
    );
}

async function addToCart(req, res) {
    try {
        const userId = req.user._id;
        const { productId, variantId, quantity } = req.body;

        if (!productId || !variantId) {
            return res.status(400).json({ message: "productId & variantId required" });
        }

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ message: "Product not available" });
        }

        if (product.sellerMode === "wholesale" || product.sellerMode === "hybrid") {
            const settings = await AdminSettings.getSettings();
            if (!settings.wholesaleEnabled && product.sellerMode === "wholesale") {
                return res.status(403).json({ message: "Wholesale products are currently unavailable" });
            }
        }

        const variant = product.variants.id(variantId);
        if (!variant || !variant.isActive) {
            return res.status(404).json({ message: "Variant not available" });
        }

        let finalQty = quantity || 1;

        // Enforce MOQ for wholesale-only products (hybrid allows retail quantities)
        if (product.sellerMode === "wholesale" && finalQty < product.moq) {
            return res.status(400).json({ message: `Minimum order quantity is ${product.moq}` });
        }

        if (finalQty > variant.stock) {
            return res.status(400).json({ message: "Insufficient stock" });
        }

        const pricing = getBulkPrice(product, finalQty, variant.price);
        const pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = await Cart.create({ user: userId, items: [] });
        }

        // Match by both productId AND variantId for correctness
        const existingItem = cart.items.find(
            i => String(i.product) === String(productId) && String(i.variantId) === String(variantId)
        );

        if (existingItem) {
            const newQty = existingItem.quantity + finalQty;
            if (newQty > variant.stock) {
                return res.status(400).json({
                    message: `Only ${variant.stock} units available (already have ${existingItem.quantity} in cart)`
                });
            }
            const newPricing = getBulkPrice(product, newQty, variant.price);
            existingItem.quantity = newQty;
            existingItem.unitPrice = newPricing.price;
            existingItem.appliedTier = newPricing.appliedTier;
            existingItem.pricingMode = resolvePricingMode(product.sellerMode, newPricing.appliedTier);
        } else {
            cart.items.push({
                product: product._id,
                store: product.store,
                seller: product.seller,
                variantId,
                quantity: finalQty,
                unitPrice: pricing.price,
                appliedTier: pricing.appliedTier,
                pricingMode,
                taxRatePercent: product.taxRatePercent || 0,
                titleSnapshot: product.title,
                skuSnapshot: variant.sku,
                imageSnapshot: variant.images?.[0] || product.images?.[0] || ""
            });
        }

        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Added to cart successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Add failed", error: error.message });
    }
}

async function getCart(req, res) {
    try {
        const cart = await Cart.findOne({ user: req.user._id })
            .populate("items.product", "title slug shortDescription images category")
            .lean();
        if (!cart) {
            return res.json({ message: "Cart is empty", cart: { items: [], subtotal: 0, taxAmount: 0, shippingAmount: 0, discountAmount: 0, grandTotal: 0 } });
        }

        // Resolve S3 presigned URLs for each item's image snapshot
        await Promise.all(cart.items.map(async (item) => {
            if (item.imageSnapshot) {
                item.imageSnapshot = await resolveUrl(item.imageSnapshot);
            }
        }));

        res.status(200).json({ message: "Cart fetched successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Fetch failed", error: error.message });
    }
}

async function updateQuantity(req, res) {
    try {
        const { productId, variantId, quantity } = req.body;

        if (!variantId) {
            return res.status(400).json({ message: "variantId required" });
        }
        if (quantity < 1) {
            return res.status(400).json({ message: "Invalid quantity" });
        }

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        const item = cart.items.find(
            i => String(i.variantId) === String(variantId) &&
                (!productId || String(i.product) === String(productId))
        );
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        const product = await Product.findById(item.product);
        if (!product || !product.isActive) {
            return res.status(404).json({ message: "Product not found or unavailable" });
        }

        const variant = product.variants.id(item.variantId);
        if (!variant || !variant.isActive) {
            return res.status(404).json({ message: "Variant not found or unavailable" });
        }

        if (quantity > variant.stock) {
            return res.status(400).json({ message: `Only ${variant.stock} units available` });
        }

        if (product.sellerMode === "wholesale" && quantity < product.moq) {
            return res.status(400).json({ message: `Minimum quantity is ${product.moq}` });
        }

        const pricing = getBulkPrice(product, quantity, variant.price);
        item.quantity = quantity;
        item.unitPrice = pricing.price;
        item.appliedTier = pricing.appliedTier;
        item.pricingMode = resolvePricingMode(product.sellerMode, pricing.appliedTier);
        item.taxRatePercent = product.taxRatePercent || 0;

        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Quantity updated successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Update failed", error: error.message });
    }
}

async function removeItem(req, res) {
    try {
        const { productId, variantId } = req.body;

        if (!variantId) {
            return res.status(400).json({ message: "variantId required" });
        }

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        const beforeCount = cart.items.length;
        cart.items = cart.items.filter(i => {
            const variantMatch = String(i.variantId) !== String(variantId);
            const productMatch = productId ? String(i.product) !== String(productId) : false;
            return variantMatch || productMatch;
        });

        if (beforeCount === cart.items.length) {
            return res.status(404).json({ message: "Item not found in cart" });
        }

        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Item removed successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Remove failed", error: error.message });
    }
}

async function clearCart(req, res) {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.json({ message: "Cart empty" });
        }
        cart.items = [];
        calculateTotals(cart);
        await cart.save();
        res.json({ message: "Cart cleared successfully", cart });
    } catch (error) {
        res.status(500).json({ message: "Clear failed", error: error.message });
    }
}

module.exports = {
    addToCart,
    getCart,
    updateQuantity,
    removeItem,
    clearCart
};
