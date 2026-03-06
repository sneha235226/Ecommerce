const User = require("../../models/User");
const Seller = require("../../models/Seller");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Dispute = require("../../models/Dispute");

function startOf(unit) {
  const now = new Date();
  if (unit === "day") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (unit === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day;
    return new Date(now.getFullYear(), now.getMonth(), diff);
  }
  if (unit === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

// GET /api/admins/dashboard/overview
async function getOverview(req, res) {
  try {
    const todayStart = startOf("day");
    const weekStart = startOf("week");
    const monthStart = startOf("month");

    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,

      totalSellers,
      pendingSellers,
      approvedSellers,
      rejectedSellers,
      suspendedSellers,

      totalOrders,
      ordersToday,
      ordersThisWeek,
      ordersThisMonth,
      orderStatusBreakdown,

      revenueAll,
      revenueToday,
      revenueThisWeek,
      revenueThisMonth,

      openDisputes,
      underReviewDisputes,

      recentOrders,
      pendingSellerList,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments({ deletedAt: null }),
      User.countDocuments({ isActive: true, isBlocked: false, deletedAt: null }),
      User.countDocuments({ isBlocked: true }),
      User.countDocuments({ createdAt: { $gte: todayStart }, deletedAt: null }),
      User.countDocuments({ createdAt: { $gte: weekStart }, deletedAt: null }),
      User.countDocuments({ createdAt: { $gte: monthStart }, deletedAt: null }),

      Seller.countDocuments({}),
      Seller.countDocuments({ status: "pending_approval" }),
      Seller.countDocuments({ status: "approved" }),
      Seller.countDocuments({ status: "rejected" }),
      Seller.countDocuments({ status: "suspended" }),

      Order.countDocuments({}),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      Order.countDocuments({ createdAt: { $gte: weekStart } }),
      Order.countDocuments({ createdAt: { $gte: monthStart } }),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: weekStart } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),

      Dispute.countDocuments({ status: "open" }),
      Dispute.countDocuments({ status: "under_review" }),

      Order.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .select("orderNumber status paymentStatus grandTotal currency createdAt user")
        .populate("user", "firstName lastName email"),

      Seller.find({ status: "pending_approval" })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("businessName contactEmail contactPhone mode createdAt"),

      Product.find({
        isActive: true,
        $expr: {
          $and: [
            { $gt: ["$totalStock", 0] },
            { $lte: ["$totalStock", "$lowStockThreshold"] },
          ],
        },
      })
        .sort({ totalStock: 1 })
        .limit(8)
        .select("title totalStock lowStockThreshold store seller")
        .populate("store", "name")
        .populate("seller", "businessName"),
    ]);

    const ordersByStatus = {};
    for (const entry of orderStatusBreakdown) {
      ordersByStatus[entry._id] = entry.count;
    }

    return res.status(200).json({
      users: {
        total: totalUsers,
        active: activeUsers,
        blocked: blockedUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersThisWeek,
        newThisMonth: newUsersThisMonth,
      },
      sellers: {
        total: totalSellers,
        pending: pendingSellers,
        approved: approvedSellers,
        rejected: rejectedSellers,
        suspended: suspendedSellers,
      },
      orders: {
        total: totalOrders,
        today: ordersToday,
        thisWeek: ordersThisWeek,
        thisMonth: ordersThisMonth,
        byStatus: ordersByStatus,
      },
      revenue: {
        allTime: revenueAll[0]?.total || 0,
        today: revenueToday[0]?.total || 0,
        thisWeek: revenueThisWeek[0]?.total || 0,
        thisMonth: revenueThisMonth[0]?.total || 0,
        currency: "INR",
      },
      disputes: {
        open: openDisputes,
        underReview: underReviewDisputes,
      },
      recentOrders,
      pendingSellerApprovals: pendingSellerList,
      lowStockProducts,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch dashboard overview", error: error.message });
  }
}

// GET /api/admins/dashboard/revenue?period=daily|monthly
async function getRevenueChart(req, res) {
  try {
    const period = req.query.period === "monthly" ? "monthly" : "daily";

    let groupId;
    let matchFrom;

    if (period === "daily") {
      matchFrom = new Date();
      matchFrom.setDate(matchFrom.getDate() - 29);
      matchFrom.setHours(0, 0, 0, 0);
      groupId = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
        day: { $dayOfMonth: "$createdAt" },
      };
    } else {
      matchFrom = new Date();
      matchFrom.setMonth(matchFrom.getMonth() - 11);
      matchFrom.setDate(1);
      matchFrom.setHours(0, 0, 0, 0);
      groupId = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      };
    }

    const [revenueData, orderCountData] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: matchFrom } } },
        { $group: { _id: groupId, revenue: { $sum: "$grandTotal" }, paidOrders: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: matchFrom } } },
        { $group: { _id: groupId, totalOrders: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),
    ]);

    const orderMap = {};
    for (const entry of orderCountData) {
      const key =
        period === "daily"
          ? `${entry._id.year}-${String(entry._id.month).padStart(2, "0")}-${String(entry._id.day).padStart(2, "0")}`
          : `${entry._id.year}-${String(entry._id.month).padStart(2, "0")}`;
      orderMap[key] = entry.totalOrders;
    }

    const chart = revenueData.map((entry) => {
      const key =
        period === "daily"
          ? `${entry._id.year}-${String(entry._id.month).padStart(2, "0")}-${String(entry._id.day).padStart(2, "0")}`
          : `${entry._id.year}-${String(entry._id.month).padStart(2, "0")}`;
      return {
        date: key,
        revenue: entry.revenue,
        paidOrders: entry.paidOrders,
        totalOrders: orderMap[key] || 0,
      };
    });

    return res.status(200).json({ period, chart });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch revenue chart", error: error.message });
  }
}

// GET /api/admins/dashboard/orders?status=&paymentStatus=&from=&to=&page=&limit=
async function getOrdersBreakdown(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("orderNumber status paymentStatus grandTotal currency orderType createdAt user")
        .populate("user", "firstName lastName email phone"),
      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      orders,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders", error: error.message });
  }
}

// GET /api/admins/dashboard/disputes?status=&page=&limit=
async function getDisputesList(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("order", "orderNumber grandTotal")
        .populate("buyer", "firstName lastName email")
        .populate("seller", "businessName contactEmail"),
      Dispute.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      disputes,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch disputes", error: error.message });
  }
}

module.exports = {
  getOverview,
  getRevenueChart,
  getOrdersBreakdown,
  getDisputesList,
};
