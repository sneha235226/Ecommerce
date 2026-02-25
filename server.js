require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
// const { ensureAdminSeeded } = require("./scripts/seedAdmin");
// const { ensureSampleSellerSeeded } = require("./scripts/seedSampleSeller");

const port = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    console.log("MongoDB connected");

    // const adminSeedResult = await ensureAdminSeeded();
    // console.log(`Admin users ${adminSeedResult.action}: ${adminSeedResult.count} (${adminSeedResult.names.join(", ")})`);

    // const sampleSellerResult = await ensureSampleSellerSeeded();
    // console.log(
    //   `Sample seller seeded [user:${sampleSellerResult.userAction}, seller:${sampleSellerResult.sellerAction}, store:${sampleSellerResult.storeAction}] `
    //   + `email=${sampleSellerResult.email}, business=${sampleSellerResult.businessName}, store=${sampleSellerResult.storeName}`
    // );

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });
