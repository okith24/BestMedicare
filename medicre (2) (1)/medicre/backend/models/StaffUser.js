const mongoose = require("mongoose");

const StaffUserSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  username: {
    type: String,
    required: false,          // not strictly needed for sign‑in/up
    unique: true,
    trim: true,
    default: function () {
      // fallback to prefix of email if user never set one
      return (this.email || "").split("@")[0] || undefined;
    }
  },

  phone: {
    type: String,
    default: ""
  },

  department: {
    type: String,
    enum: [
      "aesthetic",
      "psychiatric",
      "physiotherapy",
      "counselling"
    ]
  },

  gender: {
    type: String,
    enum: ["male", "female"]
  },

  role: {
    type: String,
    enum: ["staff", "doctor", "nurse", "superadmin"],
    default: "staff"
  },

  passwordHash: {
    type: String,
    required: true
  },

  passwordSalt: {
    type: String,
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  lastLoginAt: {
    type: Date
  },

  loginCount: {
    type: Number,
    default: 0
  }

},
{
  timestamps: true
}
);

module.exports = mongoose.model("StaffUser", StaffUserSchema);
