const mongoose = require("mongoose");

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not set in environment variables.");
  }

  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = connectDB;
