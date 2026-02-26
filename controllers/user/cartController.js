const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Product = require("../../models/Product");


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

function generateOrderNumber() {
    return "ORD-" + Date.now();
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
        if (!product || !product.isActive || !product.isPublished) {
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

        let finalQty = quantity || 1
        if (product.sellerMode === "wholesale") {
            if (finalQty < product.moq) {
                return res.status(400).json({
                    message: `Minimum order quantity is ${product.moq}`
                })
            }
            finalQty = product.moq
        }

        if (finalQty > variant.stock) {
            return res.status(400).json({
                message: "Insufficient stock"
            })
        }


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
            existingItem.quantity += finalQty
        } else {

            cart.items.push({
                product: product._id,
                store: product.store,
                seller: product.seller,
                variantId,
                quantity: finalQty,
                unitPrice: variant.price,
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

        if (product.sellerMode === "wholesale") {
            if (quantity < product.moq) {
                return res.status(400).json({
                    message: `Minimum quantity is ${product.moq}`
                })
            }
        }

        item.quantity = quantity
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
            })

        }

        let orderItems = [];
        let subtotal = 0;

        for (const item of cart.items) {
            const product = await Product.findById(item.product);
            const variant = product.variants.id(item.variantId);

            if (!variant) {
                return res.status(400).json({
                    message: "Variant missing"
                })
            }

            if (item.quantity > variant.stock) {
                return res.status(400).json({
                    message: "Stock insufficient"
                })
            }

            const totalPrice = item.unitPrice * item.quantity;

            orderItems.push({
                product: item.product,
                store: item.store,
                seller: item.seller,
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice,
                pricingMode: item.pricingMode,
                appliedTier: item.appliedTier,
                titleSnapshot: item.titleSnapshot,
                skuSnapshot: item.skuSnapshot,
                imageSnapshot: item.imageSnapshot
            });

            subtotal += totalPrice;
            variant.stock -= item.quantity;
            await product.save();
        }

        const order = await Order.create({
                user: userId,
                orderNumber: generateOrderNumber(),
                items: orderItems,
                shippingAddress,
                billingAddress,
                paymentMethod,
                subtotal,
                grandTotal: subtotal
            });


        cart.items = [];
        cart.subtotal = 0;
        cart.grandTotal = 0;

        await cart.save();
        res.json({
            message: "Order placed successfully",
            order
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Checkout failed",
            error: error.message
        })
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