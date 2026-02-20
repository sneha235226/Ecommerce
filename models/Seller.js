const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  businessName: String,
  gstNumber: String,
  taxId: String,
  bankDetails: {
    accountNumber: String,
    ifsc: String,
    bankName: String
  },
  mode: { type: String, enum: ['retail', 'wholesale', 'hybrid'] },
  isApproved: { type: Boolean, default: false },
  commission: {
    retail: Number,
    wholesale: Number,
    hybrid: Number,
    categoryOverrides: [{
      category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
      commission: Number
    }]
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Seller', sellerSchema);