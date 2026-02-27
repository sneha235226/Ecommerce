const Seller = require("../../models/Seller");
const sellerFlag = require("../../models/sellerFlag");
const User = require("../../models/User");

async function flagUser(req, res) {
    try {
        const seller = await Seller.findOne({
            user: req.user._id
        })

        const {
            userId,
            orderId,
            reason,
            message
        } = req.body

        const flag = await sellerFlag.create({
            user: userId,
            seller: seller._id,
            order: orderId,
            reason,
            message

        })

        await User.findByIdAndUpdate(
            userId,
            {
                $inc: { flagCount: 1 }
            }
        )

        const user = await User.findById(userId)

        if (user.flagCount >= 5) {
            user.isSuspicious = true
            await user.save()
        }

        res.json({
            message: "User flagged successfully"
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Flag failed",
            error: error.message
        })
    }
}

async function getSellerFlags(req, res) {
    try {
        const seller = await Seller.findOne({
            user: req.user._id
        })

        if (!seller) {
            return res.status(404).json({
                message: "Seller not found"
            })
        }

        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const skip = (page - 1) * limit

        const query = {
            seller: seller._id
        }

        const flags = await sellerFlag.find(query)
            .populate("user", "firstName phone")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const total = await sellerFlag.countDocuments(query)

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            flags
        })
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        })
    }
}

module.exports = { flagUser, getSellerFlags }