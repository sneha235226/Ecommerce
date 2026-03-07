const Order = require("../../models/Order");
const Product = require("../../models/Product");
const ContactQuery = require("../../models/ContactQuery");
const Seller = require("../../models/Seller");

// GET /api/sellers/dashboard/overview
async function getSellerOverview(req, res) {
    try {
        const sellerId = req.seller._id;
        const [
            seller,
            buyerResult,
            revenueResult,
            totalOrders,
            pendingOrders,
            lowStockCount,
            totalQueries,
            pendingQueries,
        ] = await Promise.all([
            Seller.findById(sellerId).select("ratingAverage ratingCount escrowBalance businessName mode"),

            Order.aggregate([
                { $match: { "items.seller": sellerId } },
                { $group: { _id: "$user" } },
                { $count: "total" }
            ]),

            Order.aggregate([
                { $match: { paymentStatus: "paid", "items.seller": sellerId } },
                { $unwind: "$items" },
                { $match: { "items.seller": sellerId } },
                { $group: { _id: null, total: { $sum: "$items.totalPrice" } } }
            ]),

            Order.countDocuments({ "items.seller": sellerId }),

            Order.countDocuments({
                items: { $elemMatch: { seller: sellerId, status: "placed" } }
            }),

            Product.countDocuments({
                seller: sellerId,
                isActive: true,
                $expr: {
                    $and: [
                        { $gt: ["$totalStock", 0] },
                        { $lte: ["$totalStock", "$lowStockThreshold"] }
                    ]
                }
            }),

            ContactQuery.countDocuments({ seller: sellerId }),
            ContactQuery.countDocuments({ seller: sellerId, status: "pending" }),
        ]);

        return res.status(200).json({
            store: {
                ratingAverage: seller?.ratingAverage || 0,
                ratingCount: seller?.ratingCount || 0,
                escrowBalance: seller?.escrowBalance || 0,
            },
            buyers: {
                total: buyerResult[0]?.total || 0,
            },
            revenue: {
                total: revenueResult[0]?.total || 0,
                currency: "INR",
            },
            orders: {
                total: totalOrders,
                pendingAction: pendingOrders,
            },
            inventory: {
                lowStockCount,
            },
            queries: {
                total: totalQueries,
                pending: pendingQueries,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: "Unable to fetch dashboard overview", error: error.message });
    }
}

// GET /api/sellers/dashboard/sales?period=7|30|90
async function getSalesChart(req, res) {
    try {
        const sellerId = req.seller._id;
        const period = [7, 30, 90].includes(Number(req.query.period))
            ? Number(req.query.period)
            : 30;

        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - (period - 1));
        fromDate.setHours(0, 0, 0, 0);

        const groupId = {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
        };

        const [salesData, allOrderData] = await Promise.all([
            Order.aggregate([
                { $match: { paymentStatus: "paid", "items.seller": sellerId, createdAt: { $gte: fromDate } } },
                {
                    $addFields: {
                        sellerRevenue: {
                            $sum: {
                                $map: {
                                    input: {
                                        $filter: {
                                            input: "$items",
                                            as: "item",
                                            cond: { $eq: ["$$item.seller", sellerId] }
                                        }
                                    },
                                    as: "item",
                                    in: "$$item.totalPrice"
                                }
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: groupId,
                        revenue: { $sum: "$sellerRevenue" },
                        paidOrders: { $sum: 1 }
                    }
                },
                { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
            ]),

            Order.aggregate([
                { $match: { "items.seller": sellerId, createdAt: { $gte: fromDate } } },
                {
                    $group: {
                        _id: groupId,
                        totalOrders: { $sum: 1 }
                    }
                },
                { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
            ]),
        ]);

        const orderMap = {};
        for (const entry of allOrderData) {
            const key = `${entry._id.year}-${String(entry._id.month).padStart(2, "0")}-${String(entry._id.day).padStart(2, "0")}`;
            orderMap[key] = entry.totalOrders;
        }

        const chart = salesData.map(entry => {
            const key = `${entry._id.year}-${String(entry._id.month).padStart(2, "0")}-${String(entry._id.day).padStart(2, "0")}`;
            return {
                date: key,
                revenue: entry.revenue,
                paidOrders: entry.paidOrders,
                totalOrders: orderMap[key] || 0,
            };
        });

        return res.status(200).json({ period, chart });
    } catch (error) {
        return res.status(500).json({ message: "Unable to fetch sales chart", error: error.message });
    }
}

module.exports = { getSellerOverview, getSalesChart };
