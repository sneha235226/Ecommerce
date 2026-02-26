const User = require("../../models/User");
const bcrypt = require("bcryptjs");

async function getMyProfile(req, res) {
    try {
        const user = await User.findById(req.user._id).select("-passwordHash");
        res.json({
            message: "Profile fetched successfully",
            user
        });
    } catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function updateProfile(req, res) {
    try {
        const user = await User.findById(req.user._id);
        const {
            firstName,
            lastName,
            gender,
            email,
            phone
        } = req.body;

        if (firstName !== undefined)
            user.firstName = firstName;

        if (lastName !== undefined)
            user.lastName = lastName;

        if (gender !== undefined)
            user.gender = gender;

        if (email !== undefined)
            user.email = email;

        if (phone !== undefined)
            user.phone = phone;

        await user.save();
        res.json({
            message: "Profile updated successfully",
            user
        });
    } catch (error) {
        res.status(500).json({
            message: "Update failed",
            error: error.message
        });
    }
}

async function changePassword(req, res) {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);
        const match = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!match) {
            return res.status(400).json({
                message: "Old password incorrect"
            });
        }
        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();
        res.json({
            message: "Password changed successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Change failed",
            error: error.message
        });
    }
}

async function addAddress(req, res) {
    try {
        const user = await User.findById(req.user._id);
        user.addresses.push(req.body);

        await user.save();
        res.json({
            message: "Address added",
            addresses: user.addresses
        });
    } catch (error) {
        res.status(500).json({
            message: "Add failed",
            error: error.message
        });
    }
}

async function getAddresses(req, res) {
    try {
        const user = await User.findById(req.user._id).select("addresses");
        res.json(user.addresses);
    }
    catch (error) {
        res.status(500).json({
            message: "Fetch failed",
            error: error.message
        });
    }
}

async function updateAddress(req, res) {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user._id);
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                message: "Address not found"
            });
        }
        Object.assign(address, req.body);
        await user.save();

        res.json({
            message: "Address updated",
            address
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Update failed",
            error: error.message
        });
    }
}

async function deleteAddress(req, res) {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user._id);
        user.addresses = user.addresses.filter(a => String(a._id) !== addressId);
        await user.save();
        res.json({
            message: "Address deleted successfully",
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Delete failed",
            error: error.message
        });
    }
}

async function setDefaultAddress(req, res) {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user._id);
        user.addresses.forEach(a => {
            a.isDefault = false;
        });
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                message: "Address not found"
            });
        }

        address.isDefault = true;
        await user.save();
        res.json({
            message: "Default address set successfully",
            address
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed",
            error: error.message
        });
    }
}

async function deleteAccount(req, res) {
    try {
        const user = await User.findById(req.user._id);
        user.deletedAt = new Date();
        user.isActive = false;
        await user.save();
        res.json({
            message: "Account deleted successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Delete failed",
            error: error.message
        });
    }
}

module.exports = {
    getMyProfile,
    updateProfile,
    changePassword,
    addAddress,
    getAddresses,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    deleteAccount
};
