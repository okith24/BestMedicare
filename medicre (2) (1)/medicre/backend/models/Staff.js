const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    username: { type: String, required: true, unique: true },
    phone: { type: String, default: "" },
    role: {
      type: String,
      enum: ["staff", "nurse"],
      default: "staff"
    },
    department: { type: String, default: "" },
    gender: { type: String, default: "" },
    isActive: { type: Boolean, default: true },

    // Login fields
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", StaffSchema);