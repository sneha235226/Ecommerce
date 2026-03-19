require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
const { startPayoutCron } = require("./jobs/payoutCron");
const { ensureIndex } = require("./config/elasticsearch");

const port = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    console.log("MongoDB connected");

    // Ensure Elasticsearch index exists (non-blocking — ES unavailable won't crash server)
    ensureIndex().catch((err) => console.warn("[ES] Index setup skipped:", err.message));

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    startPayoutCron();
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });
