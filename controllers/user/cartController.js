const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { generateOrderNumber } = require("../../utils/orderUtils");

function getBulkPrice(product, quantity, variantPrice) {
    if (product.bulkPricingEnabled && product.bulkPricing.length) {
        for (const tier of product.bulkPricing) {
            if (quantity >= tier.minQty && (!tier.maxQty || quantity <= tier.maxQty)) {
                return { price: tier.pricePerUnit, appliedTier: { minQty: tier.minQty, maxQty: tier.maxQty, unitPrice: tier.pricePerUnit } };
            }
        }
    }
    return { price: variantPrice, appliedTier: null };
}

function calculateTotals(cart) {
    let subtotal = 0
    cart.items.forEach(item => {
        item.lineTotal = item.unitPrice * item.quantity
        subtotal += item.lineTotal
    })
    cart.subtotal = subtotal
    cart.shippingAmount = 0
    cart.taxAmount = 0
    cart.discountAmount = 0
    cart.grandTotal =
        subtotal +
        cart.shippingAmount +
        cart.taxAmount -
        cart.discountAmount
}

async function addToCart(req, res) {
    try {
        const userId = req.user._id

        const {
            productId,
            variantId,
            quantity
        } = req.body


        if (!productId || !variantId) {
            return res.status(400).json({
                message: "productId & variantId required"
            })
        }

        const product = await Product.findById(productId)
        if (!product || !product.isActive) {
            return res.status(404).json({
                message: "Product not available"
            })
        }


        const variant = product.variants.id(variantId)
        if (!variant || !variant.isActive) {
            return res.status(404).json({
                message: "Variant not available"
            })
        }

        // B2B-only products cannot be added to a regular user cart
        if (product.targetAudience === "B2B") {
            return res.status(403).json({
                message: "This product is only available for B2B orders"
            })
        }

        let finalQty = quantity || 1

        // Enforce MOQ for wholesale-only products (hybrid allows retail quantities)
        if (product.sellerMode === "wholesale" && finalQty < product.moq) {
            return res.status(400).json({
                message: `Minimum order quantity is ${product.moq}`
            })
        }

        if (finalQty > variant.stock) {
            return res.status(400).json({
                message: "Insufficient stock"
            })
        }

        const pricing = getBulkPrice(product, finalQty, variant.price);

        let cart = await Cart.findOne({ user: userId })
        if (!cart) {
            cart = await Cart.create({
                user: userId,
                items: []
            })
        }

        const existingItem =
            cart.items.find(i =>
                String(i.variantId) === String(variantId)
            )

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
        } else {
            cart.items.push({
                product: product._id,
                store: product.store,
                seller: product.seller,
                variantId,
                quantity: finalQty,
                unitPrice: pricing.price,
                appliedTier: pricing.appliedTier,
                pricingMode: product.sellerMode,
                titleSnapshot: product.title,
                skuSnapshot: variant.sku,
                imageSnapshot:
                    variant.images?.[0] ||
                    product.images?.[0] ||
                    ""
            })
        }

        calculateTotals(cart)
        await cart.save()
        res.json({
            message: "Added to cart successfully",
            cart
        })
    } catch (error) {
        res.status(500).json({
            message: "Add failed",
            error: error.message
        })
    }
}

async function getCart(req, res) {
    try {
        const cart = await Cart.findOne({ user: req.user._id }).populate("items.product", "title images")
        if (!cart) {
            return res.json({
                items: []
            })

        }
        res.status(200).json({
            message: "Cart fetched successfully",
            cart
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

async function updateQuantity(req, res) {
    try {
        const { variantId, quantity } = req.body
        if (quantity < 1) {
            return res.status(400).json({
                message: "Invalid quantity"
            })
        }
        const cart = await Cart.findOne({
            user: req.user._id
        })
        if (!cart) {
            return res.status(404).json({
                message: "Cart not found"
            })
        }

        const item = cart.items.find(i => String(i.variantId) === variantId)

        if (!item) {
            return res.status(404).json({
                message: "Item not found"
            })
        }

        const product = await Product.findById(item.product)
        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            })
        }

        const variant = product.variants.id(item.variantId)
        if (!variant) {
            return res.status(404).json({
                message: "Variant not found"
            })
        }

        if (quantity > variant.stock) {
            return res.status(400).json({
                message: `Only ${variant.stock} units available`
            })
        }

        if (product.sellerMode === "wholesale" && quantity < product.moq) {
            return res.status(400).json({
                message: `Minimum quantity is ${product.moq}`
            })
        }

        const pricing = getBulkPrice(product, quantity, variant.price);
        item.quantity = quantity;
        item.unitPrice = pricing.price;
        item.appliedTier = pricing.appliedTier;
        calculateTotals(cart)
        await cart.save()
        res.json({
            message: "Quantity updated successfully",
            cart
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Update failed",
            error: error.message
        })
    }
}

async function removeItem(req, res) {
    try {
        const { variantId } = req.body;

        if (!variantId) {
            return res.status(400).json({
                message: "variantId required"
            });
        }

        const cart = await Cart.findOne({
            user: req.user._id
        });

        if (!cart) {
            return res.status(404).json({
                message: "Cart not found"
            });
        }

        const beforeCount = cart.items.length;

        cart.items = cart.items.filter(
            i => String(i.variantId) !== String(variantId)
        );

        if (beforeCount === cart.items.length) {
            return res.status(404).json({
                message: "Item not found in cart"
            });
        }

        calculateTotals(cart);
        await cart.save();
        res.json({
            message: "Item removed successfully",
            cart
        });

    } catch (error) {
        res.status(500).json({
            message: "Remove failed",
            error: error.message
        });
    }
}

async function clearCart(req, res) {
    try {
        const cart = await Cart.findOne({ user: req.user._id })
        if (!cart) {
            return res.json({
                message: "Cart empty"
            })
        }
        cart.items = []
        calculateTotals(cart)
        await cart.save()
        res.json({
            message: "Cart cleared successfully",
            cart
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Clear failed",
            error: error.message
        })
    }
}

async function checkoutCart(req, res) {
    try {
        const userId = req.user._id;
        const {
            shippingAddress,
            billingAddress,
            paymentMethod
        } = req.body;

        const cart = await Cart.findOne({ user: userId });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                message: "Cart empty"
            });
        }

        const resolvedItems = [];
        for (const item of cart.items) {
            const product = await Product.findById(item.product);
            if (!product || !product.isActive) {
                return res.status(400).json({
                    message: `Product "${item.titleSnapshot}" is no longer available. Please remove it from your cart.`
                });
            }

            const variant = product.variants.id(item.variantId);
            if (!variant) {
                return res.status(400).json({
                    message: `Variant for "${item.titleSnapshot}" is no longer available.`
                });
            }

            if (item.quantity > variant.stock) {
                return res.status(400).json({
                    message: `Insufficient stock for "${item.titleSnapshot}". Only ${variant.stock} left.`
                });
            }

            // Re-validate MOQ at checkout time (wholesale only)
            if (product.sellerMode === "wholesale" && item.quantity < product.moq) {
                return res.status(400).json({
                    message: `"${item.titleSnapshot}" requires a minimum quantity of ${product.moq}.`
                });
            }

            resolvedItems.push({ item, product, variant });
        }

        let orderItems = [];
        let subtotal = 0;
        let hasWholesaleItem = false;
        const stockDecrements = [];

        for (const { item, product, variant } of resolvedItems) {
            const pricing = getBulkPrice(product, item.quantity, variant.price);
            const unitPrice = pricing.price;
            const totalPrice = unitPrice * item.quantity;

            if (product.sellerMode !== "retail") hasWholesaleItem = true;

            // Atomic decrement — prevents race conditions / overselling
            const stockResult = await Product.updateOne(
                { _id: item.product, "variants._id": item.variantId, "variants.stock": { $gte: item.quantity } },
                { $inc: { "variants.$.stock": -item.quantity, totalStock: -item.quantity } }
            );

            if (stockResult.modifiedCount === 0) {
                // Compensate all prior decrements before returning
                for (const dec of stockDecrements) {
                    await Product.updateOne(
                        { _id: dec.productId, "variants._id": dec.variantId },
                        { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                    );
                }
                return res.status(400).json({ message: `Insufficient stock for "${item.titleSnapshot}". Please refresh your cart.` });
            }

            stockDecrements.push({ productId: item.product, variantId: item.variantId, qty: item.quantity });

            orderItems.push({
                product: item.product,
                store: item.store,
                seller: item.seller,
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice,
                totalPrice,
                pricingMode: item.pricingMode,
                appliedTier: pricing.appliedTier,
                titleSnapshot: item.titleSnapshot,
                skuSnapshot: item.skuSnapshot,
                imageSnapshot: item.imageSnapshot
            });

            subtotal += totalPrice;
        }

        let order;
        try {
            order = await Order.create({
                user: userId,
                orderType: hasWholesaleItem ? "B2B" : "B2C",
                orderNumber: generateOrderNumber(),
                items: orderItems,
                shippingAddress,
                billingAddress,
                paymentMethod,
                subtotal,
                grandTotal: subtotal
            });
        } catch (err) {
            // Restore all stock if order creation fails
            for (const dec of stockDecrements) {
                await Product.updateOne(
                    { _id: dec.productId, "variants._id": dec.variantId },
                    { $inc: { "variants.$.stock": dec.qty, totalStock: dec.qty } }
                );
            }
            throw err;
        }

        cart.items = [];
        cart.subtotal = 0;
        cart.grandTotal = 0;
        await cart.save();

        res.json({
            message: "Order placed successfully",
            order
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Checkout failed",
            error: error.message
        });
    }
}

module.exports = {
    addToCart,
    getCart,
    updateQuantity,
    removeItem,
    clearCart,
    checkoutCart
}