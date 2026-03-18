const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Recipient — exactly one of these will be set
    recipientUser:   { type: mongoose.Schema.Types.ObjectId, ref: "User",   default: null, index: true },
    recipientSeller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null, index: true },

    // Sender
    senderType:   { type: String, enum: ["admin", "seller"], required: true },
    senderAdmin:  { type: mongoose.Schema.Types.ObjectId, ref: "Admin",  default: null },
    senderSeller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null },

    title:   { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    channel: { type: String, enum: ["in_app", "email", "sms", "push"], default: "in_app" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead:  { type: Boolean, default: false },
    readAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientUser:   1, createdAt: -1 });
notificationSchema.index({ recipientSeller: 1, createdAt: -1 });
notificationSchema.index({ senderAdmin:     1, createdAt: -1 });
notificationSchema.index({ senderSeller:    1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
