const express = require("express");
const userAuthRoutes = require("./routes/auth/userAuth");
const adminAuthRoutes = require("./routes/auth/adminAuth");
const userRoutes = require("./routes/user/userRoutes");
const sellerRoutes = require("./routes/seller/sellerRoutes");
const adminRoutes = require("./routes/admin/adminRoutes");
const publicRoutes = require("./routes/public/public.routes");

const app = express();

const cors = require("cors");

app.use(cors());

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

app.use("/api/auth", userAuthRoutes);
app.use("/api/auth/admin", adminAuthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/public", publicRoutes);

app.use((err, req, res, next) => {
  res.status(500).json({ message: "Internal server error", error: err.message });
});

module.exports = app;
