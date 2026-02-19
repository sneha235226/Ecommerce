require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
const { ensureAdminSeeded } = require("./scripts/seedAdmin");

const port = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    console.log("MongoDB connected");

    const result = await ensureAdminSeeded();
    console.log(`Admin users ${result.action}: ${result.count} (${result.names.join(", ")})`);

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });
