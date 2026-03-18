const mongoose = require("mongoose");

const PasswordResetOtpSchema = new mongoose.Schema(
  {
    phoneNormalized: { type: String, required: true, trim: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    userModel: {
      type: String,
      required: true,
      enum: ["User", "StaffUser", "Staff"]
    },
    otpHash: {
      type: String,
      required: true
    },
    resetTokenHash: {
      type: String,
      required: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    consumedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

PasswordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasswordResetOtpSchema.index({ phoneNormalized: 1, createdAt: -1 });
PasswordResetOtpSchema.index({ userId: 1, userModel: 1, createdAt: -1 });

module.exports = mongoose.model("PasswordResetOtp", PasswordResetOtpSchema);
