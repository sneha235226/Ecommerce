const User = require("../../models/User");

async function getUsers(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const skip = (page - 1) * limit;
        const search = req.query.search || "";

        let query = {};

        if (search) {
            query = {
                $or: [
                    { firstName: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            };
        }

        const [users, total] = await Promise.all([
            User.find(query)
                .select("-passwordHash")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            User.countDocuments(query)
        ]);

        return res.status(200).json({
            page,
            limit,
            totalUsers: total,
            totalPages: Math.ceil(total / limit),
            users
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Unable to fetch users",
            error: error.message
        });
    }
}

async function getUserById(req, res) {
    try {
        const { id } = req.params;
        const user =  await User.findById(id) .select("-passwordHash");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.status(200).json({
            message: "User fetched successfully",
            user
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Unable to fetch user",
            error: error.message
        });
    }
}

module.exports = {
    getUsers,
    getUserById
};