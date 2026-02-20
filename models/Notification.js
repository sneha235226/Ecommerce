const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "order_confirmation",
        "shipping_update",
        "refund_update",
        "promotion",
        "seller_order_update",
        "admin_alert",
      ],
      required: true,
    },
    title: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    channel: { type: String, enum: ["in_app", "email", "sms", "push"], default: "in_app" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
