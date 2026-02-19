const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Admin = require("../models/Admin");

function getAdminsFromEnv() {
  const adminsJson = process.env.ADMINS_JSON;

  if (!adminsJson) {
    throw new Error("ADMINS_JSON is required.");
  }

  let parsed;
  try {
    parsed = JSON.parse(adminsJson);
  } catch {
    throw new Error("ADMINS_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("ADMINS_JSON must be a non-empty array.");
  }

  return parsed;
}

async function ensureAdminSeeded() {
  const admins = getAdminsFromEnv();

  if (!admins.length) {
    throw new Error("No admins provided for seeding.");
  }

  const payload = [];
  const names = [];

  for (const [index, admin] of admins.entries()) {
    const email = admin?.email;
    const phone = admin?.phone;
    const password = admin?.password;

    if (!email || !phone || !password) {
      throw new Error(`Admin at index ${index} must include email, phone, and password.`);
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      throw new Error("Cannot seed admin: identifier already used by a non-admin user.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const displayName = admin?.name || email.split("@")[0];
    payload.push({
      email,
      phone,
      passwordHash,
    });
    names.push(displayName);
  }

  const deleted = await Admin.deleteMany({});
  await Admin.insertMany(payload, { ordered: true });

  return {
    action: deleted.deletedCount > 0 ? "recreated" : "created",
    count: payload.length,
    names,
  };
}

module.exports = { ensureAdminSeeded };
