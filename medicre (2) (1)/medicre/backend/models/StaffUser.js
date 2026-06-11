// Mongoose model for staff login accounts.

const mongoose = require("mongoose");

// This schema stores the login account details for staff-side users.
const StaffUserSchema = new mongoose.Schema(
{
  // Basic identity details used to show who the staff user is.
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

  // Username is optional; if missing, it is created from the email prefix.
  username: {
    type: String,
    required: false,          
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

  // Department helps classify the staff member's work area.
  department: {
    type: String,
    enum: [
      "aesthetic",
      "psychiatric",
      "physiotherapy",
      "counselling"
    ]
  },

  // Gender is stored as a simple profile field.
  gender: {
    type: String,
    enum: ["male", "female"]
  },

  // Role controls what kind of staff access this account should have.
  role: {
    type: String,
    enum: ["staff", "doctor", "nurse", "superadmin"],
    default: "staff"
  },

  // These two fields store the secured password data, not the plain password itself.
  passwordHash: {
    type: String,
    required: true
  },

  passwordSalt: {
    type: String,
    required: true
  },

  // Account status flag used to enable or disable staff access.
  isActive: {
    type: Boolean,
    default: true
  },

  // Login tracking fields help monitor recent access and usage count.
  lastLoginAt: {
    type: Date
  },

  loginCount: {
    type: Number,
    default: 0
  }

},
{
  // Automatically add createdAt and updatedAt timestamps.
  timestamps: true
}
);

// Export the model so other backend files can create, read, and update staff users.
module.exports = mongoose.model("StaffUser", StaffUserSchema);

