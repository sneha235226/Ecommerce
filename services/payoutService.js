const axios = require("axios");
const Order = require("../models/Order");
const Seller = require("../models/Seller");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Razorpay Payouts API base URL (X-axis account — uses basic auth with key_id:key_secret)
const PAYOUTS_BASE = "https://api.razorpay.com/v1";

function razorpayAuth() {
    return {
        username: RAZORPAY_KEY_ID,
        password: RAZORPAY_KEY_SECRET
    };
}

// Create or reuse a Razorpay Contact for the seller.
// In production you'd store contactId on Seller doc; here we always create fresh.
async function getOrCreateContact(seller) {
    const { data } = await axios.post(
        `${PAYOUTS_BASE}/contacts`,
        {
            name: seller.bankDetails?.accountHolderName || seller.firstName,
            email: seller.email || undefined,
            contact: seller.phone || undefined,
            type: "vendor",
            reference_id: String(seller._id)
        },
        { auth: razorpayAuth() }
    );
    return data.id;
}

// Create a Fund Account (bank account) linked to the contact.
async function createFundAccount(contactId, seller) {
    const bank = seller.bankDetails;
    const { data } = await axios.post(
        `${PAYOUTS_BASE}/fund_accounts`,
        {
            contact_id: contactId,
            account_type: "bank_account",
            bank_account: {
                name: bank.accountHolderName,
                ifsc: bank.ifsc,
                account_number: bank.accountNumber
            }
        },
        { auth: razorpayAuth() }
    );
    return data.id;
}

// Trigger payout for a single order item.
// orderId   — the Order._id
// itemId    — the OrderItem._id
// Returns the Razorpay payout object on success.
async function releasePayout(orderId, itemId) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    const item = order.items.id(itemId);
    if (!item) throw new Error("Order item not found");

    if (item.payoutStatus !== "on_hold") {
        throw new Error(`Payout not eligible: current status is "${item.payoutStatus}"`);
    }

    // Allow payout if return was rejected (seller wins dispute) or no return was requested
    if (item.returnStatus !== "none" && item.returnStatus !== "rejected") {
        throw new Error(`Payout blocked: return status is "${item.returnStatus}"`);
    }

    const seller = await Seller.findById(item.seller);
    if (!seller) throw new Error("Seller not found");

    const bank = seller.bankDetails;
    if (!bank?.accountNumber || !bank?.ifsc || !bank?.accountHolderName) {
        throw new Error(`Seller ${seller._id} has incomplete bank details`);
    }

    // Amount in paise (Razorpay uses smallest currency unit)
    const amountPaise = Math.round(item.sellerPayoutAmount * 100);
    if (amountPaise <= 0) throw new Error("Payout amount is zero or negative");

    // Step 1: Create contact
    const contactId = await getOrCreateContact(seller);

    // Step 2: Create fund account
    const fundAccountId = await createFundAccount(contactId, seller);

    // Step 3: Initiate payout
    const { data: payout } = await axios.post(
        `${PAYOUTS_BASE}/payouts`,
        {
            account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
            fund_account_id: fundAccountId,
            amount: amountPaise,
            currency: "INR",
            mode: "IMPS",
            purpose: "vendor_advance",
            queue_if_low_balance: true,
            reference_id: `${String(order._id)}_${String(item._id)}`,
            narration: `Order ${order.orderNumber} - seller payout`
        },
        { auth: razorpayAuth() }
    );

    // Step 4: Update item
    item.payoutStatus = "paid";
    item.razorpayPayoutId = payout.id;
    await order.save();

    return payout;
}

module.exports = { releasePayout };
