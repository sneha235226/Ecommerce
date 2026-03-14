const Wishlist = require("../../models/Wishlist");
const Product = require("../../models/Product");

async function toggleWishlist(req, res) {
    try {
        const userId = req.user._id;
        const { productId, variantId } = req.body;

        if (!productId) {
            return res.status(400).json({
                message: "productId required"
            });
        }

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        let wishlist = await Wishlist.findOne({
            user: userId
        });
        if (!wishlist) {
            wishlist = await Wishlist.create({
                user: userId,
                items: []
            });
        }

        const existingIndex =
            wishlist.items.findIndex(i =>
                String(i.product) === productId &&
                String(i.variantId || "") === String(variantId || "")
            );

        if (existingIndex > -1) {
            wishlist.items.splice(existingIndex, 1);
            await wishlist.save();
            return res.json({
                message: "Removed from wishlist",
                totalItems: wishlist.items.length,
                wishlist
            });
        }

        let variant = null;
        if (variantId) {
            variant = product.variants.id(variantId);
        }

        wishlist.items.push({
            product: product._id,
            variantId: variantId || null,
            titleSnapshot: product.title,
            imageSnapshot:
                variant?.images?.[0] ||
                product.images?.[0] ||
                ""
        });
        await wishlist.save();
        res.json({
            message: "Added to wishlist",
            totalItems: wishlist.items.length,
            wishlist
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Wishlist update failed",
            error: error.message
        });
    }
}

async function getWishlist(req, res) {
    try {
        const wishlist = await Wishlist.findOne({
            user: req.user._id
        }).populate("items.product", "title images basePrice");

        if (!wishlist) {
            return res.json({ items: [], totalItems: 0 });
        }

        const validItems = wishlist.items.filter(i => i.product !== null);
        if (validItems.length !== wishlist.items.length) {
            wishlist.items = validItems;
            await wishlist.save();
        }

        res.status(200).json({
            message: "Wishlist fetched successfully",
            totalItems: wishlist.items.length,
            wishlist
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function removeWishlistItem(req, res) {
    try {
        const { productId, variantId } = req.body;

        const wishlist = await Wishlist.findOne({ user: req.user._id });
        if (!wishlist) {
            return res.status(404).json({
                message: "Wishlist not found"
            });
        }

        wishlist.items = wishlist.items.filter(i => !(
            String(i.product) === productId &&
            String(i.variantId || "") === String(variantId || "")
        ));

        await wishlist.save();
        res.json({
            message: "Item removed successfully",
            totalItems: wishlist.items.length,
            wishlist
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Remove failed",
            error: error.message
        });
    }
}

async function clearWishlist(req, res) {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user._id });
        if (!wishlist) {
            return res.json({
                message: "Wishlist already empty"
            });
        }

        wishlist.items = [];
        await wishlist.save();

        res.json({
            message: "Wishlist cleared successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Clear failed",
            error: error.message
        });
    }
}

module.exports = {
    toggleWishlist,
    getWishlist,
    removeWishlistItem,
    clearWishlist
}