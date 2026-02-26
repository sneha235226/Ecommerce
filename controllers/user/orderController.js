const Order = require("../../models/Order");
const Product = require("../../models/Product");

function generateOrderNumber() {
    return "ORD-" + Date.now();
}

function getBulkPrice(product, quantity, variantPrice) {

    let appliedTier = null;
    let price = variantPrice;

    if (product.bulkPricingEnabled && product.bulkPricing.length) {

        for (const tier of product.bulkPricing) {

            if (
                quantity >= tier.minQty &&
                (!tier.maxQty || quantity <= tier.maxQty)
            ) {
                price = tier.pricePerUnit;

                appliedTier = {
                    minQty: tier.minQty,
                    maxQty: tier.maxQty,
                    unitPrice: tier.pricePerUnit
                };

                break;
            }

        }

    }

    return { price, appliedTier };
}

async function buyNow(req, res) {
    try {
        const userId = req.user._id;
        const {
            productId,
            variantId,
            quantity,
            shippingAddress,
            billingAddress,
            paymentMethod
        } = req.body;


        const product = await Product.findById(productId);
        if (!product)
            return res.status(404).json({
                message: "Product not found"
            });


        const variant = product.variants.id(variantId);

        if (!variant)
            return res.status(404).json({
                message: "Variant not found"
            });


        let finalQty = quantity || 1;
        if (
            product.sellerMode !== "retail" &&
            finalQty < product.moq
        ) {

            return res.status(400).json({
                message:
                    `Minimum order quantity is ${product.moq}`
            });

        }


        if (finalQty > variant.stock) {
            return res.status(400).json({
                message: "Insufficient stock"
            });
        }

        const pricing = getBulkPrice(
            product,
            finalQty,
            variant.price
        );


        const unitPrice = pricing.price;
        const totalPrice = unitPrice * finalQty;

        const item = {
            product: product._id,
            store: product.store,
            seller: product.seller,
            variantId,
            quantity: finalQty,
            unitPrice,
            totalPrice,
            pricingMode: product.sellerMode,
            appliedTier: pricing.appliedTier,
            titleSnapshot: product.title,
            skuSnapshot: variant.sku,
            imageSnapshot:
                variant.images?.[0]
                ||
                product.images?.[0]
                ||
                ""
        };

        const subtotal = totalPrice;
        const order = await Order.create({
            user: userId,
            orderType: product.sellerMode === "retail" ? "B2C" : "B2B",
            orderNumber: generateOrderNumber(),
            items: [item],
            shippingAddress,
            billingAddress,
            paymentMethod,
            subtotal,
            grandTotal: subtotal
        });

        variant.stock -= finalQty;
        await product.save();
        res.status(201).json({
            message: "Order created successfully",
            order
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Order creation failed",
            error: error.message
        })
    }
}

async function getMyOrders(req, res) {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find({
            user: req.user._id
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("items.product", "title images");

        const total = await Order.countDocuments({
            user: req.user._id
        });

        res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            orders
        });
    } catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function getMyOrderById(req, res) {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.user._id
        }).populate("items.product", "title images");

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        res.status(200).json({
            message: "Order fetched successfully",
            order
        });
    } catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

module.exports = { buyNow, getMyOrders, getMyOrderById };
