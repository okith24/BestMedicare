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

    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log(" Connected to database");

    // Check if a superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: "superadmin" });

    if (existingSuperAdmin) {
      console.log("⚠ Super Admin already exists.");
      await mongoose.disconnect();
      process.exit(0);
    }

    const email = normalizeEmail("superadmin@hospital.com");
    const password = "SuperAdmin@123"; //  Change after first login

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
    console.log("Login credentials:");
    console.log("Email:", email);
    console.log("Password:", password);

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error(" Error creating Super Admin:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperAdmin();