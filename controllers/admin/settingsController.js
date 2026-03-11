const AdminSettings = require("../../models/AdminSettings");

// GET /api/admin/settings
async function getSettings(req, res) {
    try {
        const settings = await AdminSettings.getSettings();
        return res.status(200).json({ message: "Settings fetched successfully", settings });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch settings", error: error.message });
    }
}

// PATCH /api/admin/settings
// Allowed fields: nearbyStoreRadiusKm, defaultCommissionPercent, wholesaleEnabled, nearbyStoresEnabled
async function updateSettings(req, res) {
    try {
        const allowedFields = [
            "nearbyStoreRadiusKm",
            "defaultCommissionPercent",
            "returnWindowDays",
            "wholesaleEnabled",
            "nearbyStoresEnabled"
        ];

        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No valid fields provided" });
        }

        // Validate nearbyStoreRadiusKm range
        if (updates.nearbyStoreRadiusKm !== undefined) {
            const r = Number(updates.nearbyStoreRadiusKm);
            if (isNaN(r) || r < 1 || r > 500) {
                return res.status(400).json({ message: "nearbyStoreRadiusKm must be between 1 and 500" });
            }
            updates.nearbyStoreRadiusKm = r;
        }

        if (updates.defaultCommissionPercent !== undefined) {
            const c = Number(updates.defaultCommissionPercent);
            if (isNaN(c) || c < 0 || c > 100) {
                return res.status(400).json({ message: "defaultCommissionPercent must be between 0 and 100" });
            }
            updates.defaultCommissionPercent = c;
        }

        if (updates.returnWindowDays !== undefined) {
            const d = Number(updates.returnWindowDays);
            if (isNaN(d) || d < 0 || d > 60) {
                return res.status(400).json({ message: "returnWindowDays must be between 0 and 60" });
            }
            updates.returnWindowDays = d;
        }

        const settings = await AdminSettings.findOneAndUpdate(
            {},
            { $set: updates },
            { upsert: true, new: true, runValidators: true }
        );

        return res.status(200).json({ message: "Settings updated successfully", settings });
    } catch (error) {
        return res.status(500).json({ message: "Failed to update settings", error: error.message });
    }
}

module.exports = { getSettings, updateSettings };
