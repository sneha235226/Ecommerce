const Order = require("../../models/Order");
const Seller = require("../../models/Seller");


async function getSellerOrders(req, res) {

    try {

        const seller = await Seller.findOne({
            user: req.user._id
        })
        const sellerId = seller._id;


        const page = parseInt(req.query.page) || 1;

        const limit = parseInt(req.query.limit) || 10;

        const skip = (page - 1) * limit;

        const status = req.query.status;


        let query;


        // Seller specific filter
        if (status) {

            query = {

                items: {
                    $elemMatch: {
                        seller: sellerId,
                        status: status
                    }
                }

            };

        } else {

            query = {
                "items.seller": sellerId
            };

        }



        const orders = await Order.find(query)

            .sort({ createdAt: -1 })

            .skip(skip)

            .limit(limit)

            .select(
                "orderNumber items status paymentStatus grandTotal createdAt"
            );



        const total = await Order.countDocuments(query);



        res.status(200).json({

            page,

            limit,

            total,

            totalPages: Math.ceil(total / limit),

            orders

        });

    }

    catch (error) {

        res.status(500).json({

            message: "Fetch failed",

            error: error.message

        });

    }

}




async function getSellerOrderById(req, res) {

    try {

        const sellerId = req.seller._id;



        const order = await Order.findOne({

            _id: req.params.id,

            "items.seller": sellerId

        })

            .populate("user", "firstName phone")

            .populate("items.product", "title");



        if (!order) {

            return res.status(404).json({

                message: "Order not found"

            });

        }



        res.status(200).json({

            message: "Order fetched successfully",

            order

        });

    }

    catch (error) {

        res.status(500).json({

            message: "Fetch failed",

            error: error.message

        });

    }

}



module.exports = {

    getSellerOrders,

    getSellerOrderById

};