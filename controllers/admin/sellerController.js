const Seller = require("../../models/Seller");
const Store = require("../../models/Store");
const Product = require("../../models/Product");

// GET /api/admins/sellers?status=&search=&page=&limit=
async function listSellers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.search) {
      const re = { $regex: req.query.search, $options: "i" };
      filter.$or = [
        { businessName: re },
        { legalBusinessName: re },
        { contactEmail: re },
        { contactPhone: re },
        { gstNumber: re },
      ];
    }

    const [sellers, total] = await Promise.all([
      Seller.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "firstName lastName email phone isBlocked isActive"),
      Seller.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sellers,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to list sellers", error: error.message });
  }
}

// GET /api/admins/sellers/:id
async function getSellerById(req, res) {
  try {
    const seller = await Seller.findById(req.params.id)
      .populate("user", "firstName lastName email phone isBlocked isActive createdAt")
      .populate("approval.approvedBy", "name email");

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    return res.status(200).json({ seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch seller", error: error.message });
  }
}

async function approveSeller(req, res) {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (seller.status === "approved") {
      return res.status(400).json({ message: "Seller is already approved" });
    }

    if (seller.status === "suspended") {
      return res.status(400).json({ message: "Seller is suspended. Use reinstate instead." });
    }

    if (seller.status === "rejected") {
      return res.status(400).json({ message: "Seller was rejected. Use reinstate to restore access." });
    }

    seller.status = "approved";
    seller.approval.approvedBy = req.user._id;
    seller.approval.approvedAt = new Date();
    seller.approval.rejectionReason = "";
    await seller.save();

    return res.status(200).json({ message: "Seller approved successfully", sellerId: seller._id, status: seller.status });
  } catch (error) {
    return res.status(500).json({ message: "Unable to approve seller", error: error.message });
  }
}

async function rejectSeller(req, res) {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (seller.status === "rejected") {
      return res.status(400).json({ message: "Seller is already rejected" });
    }

    if (seller.status === "approved") {
      return res.status(400).json({ message: "Cannot reject an approved seller. Use suspend instead." });
    }

    if (seller.status === "suspended") {
      return res.status(400).json({ message: "Seller is already suspended. Use reinstate or leave as is." });
    }

    seller.status = "rejected";
    seller.approval.rejectionReason = String(reason).trim();
    seller.approval.approvedBy = req.user._id;
    seller.approval.approvedAt = new Date();
    await seller.save();

    return res.status(200).json({ message: "Seller rejected", sellerId: seller._id, status: seller.status });
  } catch (error) {
    return res.status(500).json({ message: "Unable to reject seller", error: error.message });
  }
}

async function suspendSeller(req, res) {
  try {
    const { reason } = req.body;

    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (seller.status === "suspended") {
      return res.status(400).json({ message: "Seller is already suspended" });
    }

    if (seller.status !== "approved") {
      return res.status(400).json({
        message: `Only approved sellers can be suspended. Current status: "${seller.status}"`
      });
    }

    seller.status = "suspended";
    seller.approval.rejectionReason = reason ? String(reason).trim() : "";

    await Promise.all([
      Store.updateMany({ seller: seller._id }, { isActive: false }),
      Product.updateMany({ seller: seller._id }, { isActive: false }),
    ]);

    await seller.save();

    return res.status(200).json({ message: "Seller suspended successfully", sellerId: seller._id, status: seller.status });
  } catch (error) {
    return res.status(500).json({ message: "Unable to suspend seller", error: error.message });
  }
}

async function reinstateSeller(req, res) {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (seller.status === "approved") {
      return res.status(400).json({ message: "Seller is already approved" });
    }

    if (seller.status === "pending_approval") {
      return res.status(400).json({ message: "Seller is pending approval. Use approve instead." });
    }

    seller.status = "approved";
    seller.approval.rejectionReason = "";
    seller.approval.approvedBy = req.user._id;
    seller.approval.approvedAt = new Date();

    await Promise.all([
      Store.updateMany({ seller: seller._id }, { isActive: true }),
      Product.updateMany({ seller: seller._id }, { isActive: true }),
      seller.save(),
    ]);

    return res.status(200).json({ message: "Seller reinstated successfully", sellerId: seller._id, status: seller.status });
  } catch (error) {
    return res.status(500).json({ message: "Unable to reinstate seller", error: error.message });
  }
}

module.exports = {
  listSellers,
  getSellerById,
  approveSeller,
  rejectSeller,
  suspendSeller,
  reinstateSeller,
};
