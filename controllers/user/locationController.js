const User = require("../../models/User");

// PATCH /api/users/location
// Body: { lat, lng }
async function saveLocation(req, res) {
    try {
        const { lat, lng } = req.body;

        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ message: "lat and lng are required" });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ message: "lat and lng must be valid numbers" });
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({ message: "Invalid coordinates" });
        }

        await User.updateOne(
            { _id: req.user._id },
            {
                $set: {
                    "lastLocation.type": "Point",
                    "lastLocation.coordinates": [longitude, latitude],
                    "lastLocation.updatedAt": new Date()
                }
            }
        );

        return res.status(200).json({ message: "Location saved successfully" });
    } catch (error) {
        return res.status(500).json({ message: "Failed to save location", error: error.message });
    }
}

module.exports = { saveLocation };
