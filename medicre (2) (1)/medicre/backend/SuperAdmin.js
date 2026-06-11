// Seed and helper logic for the super admin account.

require("dotenv").config();
const mongoose = require("mongoose");

const User = require("./auth/userModel");
const { hashPassword, normalizeEmail } = require("./auth/security");

const MONGO_URI = process.env.MONGO_URI;

async function createSuperAdmin() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    const email = normalizeEmail(process.env.SUPERADMIN_EMAIL || "superadmin@hospital.com");
    const password = process.env.SUPERADMIN_INIT_PASSWORD;

    if (!password) {
      throw new Error(
        "SUPERADMIN_INIT_PASSWORD is not set in .env file. " +
        "Generate a strong password and set it before running this script."
      );
    }

    if (password.length < 12) {
      throw new Error("SUPERADMIN_INIT_PASSWORD must be at least 12 characters.");
    }

    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log(" Connected to database");

    // Check if a superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: "superadmin" });

    if (existingSuperAdmin) {
      console.log(" Super Admin already exists.");
      await mongoose.disconnect();
      process.exit(0);
    }

    // Generate salt + hash using your security.js (scrypt)
    const { salt, hash } = hashPassword(password);

    const superAdmin = new User({
      name: "System Super Admin",
      email,
      phone: "",
      role: "superadmin",
      passwordSalt: salt,
      passwordHash: hash,
      isActive: true
    });

    await superAdmin.save();

    console.log(" Super Admin created successfully!");
    console.log("Email:", email);
    console.log("Password: [set via SUPERADMIN_INIT_PASSWORD env var — not logged]");

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error(" Error creating Super Admin:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperAdmin();
