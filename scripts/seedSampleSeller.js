const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Seller = require("../models/Seller");
const Store = require("../models/Store");

function defaultSampleSeller() {
  return {
    firstName: "Sample",
    lastName: "Seller",
    email: "mayankarya2405@gmail.com",
    phone: "7210282783",
    password: "Seller@123",
    gender: "prefer_not_to_say",
    addresses: [
      {
        fullName: "Sample Seller",
        phone: "7210282783",
        line1: "101 Market Street",
        line2: "Industrial Area",
        landmark: "Near Metro",
        city: "Noida",
        state: "Uttar Pradesh",
        postalCode: "201301",
        country: "India",
        label: "work",
        isDefault: true,
        addressType: "both",
      },
    ],
    seller: {
      businessName: "Hybrid Trade Hub",
      legalBusinessName: "Mayank Arya",
      contactEmail: "mayankarya2405@gmail.com",
      contactPhone: "7210282783",
      gstNumber: "09ABCDE1234F1Z5",
      panDetails: {
        panNumber: "EWKPA1484G",
        nameAsPerPan: "MAYANK ARYA",
        dateOfIncorporation: "2004-09-23",
      },
      businessAddress: {
        line1: "101 Market Street",
        line2: "Industrial Area",
        city: "Noida",
        state: "Uttar Pradesh",
        postalCode: "201301",
        country: "India",
      },
      bankDetails: {
        accountHolderName: "Hybrid Trade Hub Pvt Ltd",
        accountNumber: "123456789012",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
        branchName: "Noida Sector 18",
        upiId: "hybridtrade@hdfcbank",
      },
      panVerification: { status: "unverified" },
      mode: "hybrid",
      wholesaleCapabilities: {
        moq: 10,
        leadTimeDays: 3,
        manufacturingCapacityPerMonth: 5000,
      },
      status: "approved",
      approval: {
        approvedAt: new Date(),
        rejectionReason: "",
      },
    },
    store: {
      name: "Hybrid Trade Store",
      slug: "hybrid-trade-store",
      description: "Sample hybrid seller storefront",
      logoUrl: "",
      bannerUrl: "",
      isActive: true,
      serviceablePostalCodes: ["201301", "110001", "122001"],
      defaultLeadTimeDays: 2,
      returnPolicy: "7-day return for eligible products",
    },
  };
}

function getSampleSellerFromEnv() {
  const raw = process.env.SAMPLE_SELLER_JSON;
  if (!raw) return defaultSampleSeller();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SAMPLE_SELLER_JSON must be valid JSON.");
  }

  return {
    ...defaultSampleSeller(),
    ...parsed,
    seller: {
      ...defaultSampleSeller().seller,
      ...(parsed?.seller || {}),
      panDetails: {
        ...defaultSampleSeller().seller.panDetails,
        ...(parsed?.seller?.panDetails || {}),
      },
      businessAddress: {
        ...defaultSampleSeller().seller.businessAddress,
        ...(parsed?.seller?.businessAddress || {}),
      },
      bankDetails: {
        ...defaultSampleSeller().seller.bankDetails,
        ...(parsed?.seller?.bankDetails || {}),
      },
      wholesaleCapabilities: {
        ...defaultSampleSeller().seller.wholesaleCapabilities,
        ...(parsed?.seller?.wholesaleCapabilities || {}),
      },
    },
    store: {
      ...defaultSampleSeller().store,
      ...(parsed?.store || {}),
    },
  };
}

async function findUniqueStoreSlug(baseSlug, existingStoreId = null) {
  let slug = String(baseSlug || "sample-store").trim().toLowerCase();
  if (!slug) slug = "sample-store";

  let candidate = slug;
  let suffix = 1;

  while (true) {
    const conflict = await Store.findOne({ slug: candidate });
    if (!conflict || (existingStoreId && String(conflict._id) === String(existingStoreId))) {
      return candidate;
    }
    suffix += 1;
    candidate = `${slug}-${suffix}`;
  }
}

async function ensureSampleSellerSeeded() {
  const sample = getSampleSellerFromEnv();

  if (!sample.email || !sample.phone || !sample.password) {
    throw new Error("Sample seller must include email, phone, and password.");
  }

  const identifiers = [{ email: sample.email }, { phone: sample.phone }];
  const existingAdmin = await Admin.findOne({ $or: identifiers });
  if (existingAdmin) {
    throw new Error("Cannot seed sample seller: email or phone is already used by an admin.");
  }

  const passwordHash = await bcrypt.hash(sample.password, 12);

  let user = await User.findOne({ $or: identifiers });
  let userAction = "updated";

  if (!user) {
    user = await User.create({
      firstName: sample.firstName,
      lastName: sample.lastName,
      gender: sample.gender,
      email: sample.email,
      phone: sample.phone,
      passwordHash,
      role: "seller",
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      addresses: Array.isArray(sample.addresses) ? sample.addresses : [],
    });
    userAction = "created";
  } else {
    user.firstName = sample.firstName;
    user.lastName = sample.lastName;
    user.gender = sample.gender;
    user.email = sample.email;
    user.phone = sample.phone;
    user.passwordHash = passwordHash;
    user.role = "seller";
    user.isActive = true;
    user.isEmailVerified = true;
    user.isPhoneVerified = true;
    user.addresses = Array.isArray(sample.addresses) ? sample.addresses : user.addresses;
    await user.save();
  }

  let seller = await Seller.findOne({ user: user._id });
  let sellerAction = "updated";

  if (!seller) {
    seller = new Seller({ user: user._id });
    sellerAction = "created";
  }

  seller.businessName = sample.seller.businessName;
  seller.legalBusinessName = sample.seller.legalBusinessName;
  seller.contactEmail = sample.seller.contactEmail;
  seller.contactPhone = sample.seller.contactPhone;
  seller.gstNumber = sample.seller.gstNumber;
  seller.panDetails = sample.seller.panDetails;
  seller.businessAddress = sample.seller.businessAddress;
  seller.bankDetails = sample.seller.bankDetails;
  seller.panVerification = sample.seller.panVerification;
  seller.mode = "hybrid";
  seller.wholesaleCapabilities = sample.seller.wholesaleCapabilities;
  seller.status = sample.seller.status || "approved";
  seller.approval = {
    ...seller.approval,
    ...sample.seller.approval,
  };

  await seller.save();

  let store = await Store.findOne({ seller: seller._id });
  let storeAction = "updated";

  if (!store) {
    store = new Store({ seller: seller._id });
    storeAction = "created";
  }

  store.name = sample.store.name;
  store.slug = await findUniqueStoreSlug(sample.store.slug, store._id);
  store.description = sample.store.description;
  store.logoUrl = sample.store.logoUrl;
  store.bannerUrl = sample.store.bannerUrl;
  store.isActive = sample.store.isActive;
  store.serviceablePostalCodes = sample.store.serviceablePostalCodes;
  store.defaultLeadTimeDays = sample.store.defaultLeadTimeDays;
  store.returnPolicy = sample.store.returnPolicy;

  await store.save();

  return {
    userAction,
    sellerAction,
    storeAction,
    userId: user._id.toString(),
    sellerId: seller._id.toString(),
    storeId: store._id.toString(),
    email: user.email,
    businessName: seller.businessName,
    storeName: store.name,
  };
}

module.exports = { ensureSampleSellerSeeded };
