const mongoose = require("mongoose");

// Singleton document — only one settings record ever exists.
// Use AdminSettings.getSettings() to read, and updateOne with upsert to write.
const adminSettingsSchema = new mongoose.Schema(
    {
        // Geolocation
        nearbyStoreRadiusKm: { type: Number, min: 1, max: 500, default: 10 },

        // Platform commission fallback (used if seller has no individual commission set)
        defaultCommissionPercent: { type: Number, min: 0, max: 100, default: 10 },

        // Return window — how many days after delivery before seller payout is released
        returnWindowDays: { type: Number, min: 0, max: 60, default: 7 },

        // Feature flags
        wholesaleEnabled: { type: Boolean, default: true },
        nearbyStoresEnabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Static helper to always get (or create) the single settings document
// Uses findOneAndUpdate with upsert — atomic, safe under concurrent requests
adminSettingsSchema.statics.getSettings = async function () {
    return this.findOneAndUpdate(
        {},
        {},
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.models.AdminSettings || mongoose.model("AdminSettings", adminSettingsSchema);
