const express = require("express");
const userAuthRoutes = require("./routes/auth/userAuth");
const adminAuthRoutes = require("./routes/auth/adminAuth");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

app.use("/api/auth", userAuthRoutes);
app.use("/api/auth/admin", adminAuthRoutes);
app.use("/api/users", userRoutes);

app.use((err, req, res, next) => {
  res.status(500).json({ message: "Internal server error", error: err.message });
});

module.exports = app;
