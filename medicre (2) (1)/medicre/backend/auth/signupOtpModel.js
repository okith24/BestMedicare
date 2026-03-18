const mongoose = require("mongoose");

const SignupOtpSchema = new mongoose.Schema(
  {
    phoneNormalized: { type: String, required: true, trim: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    pendingProfile: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      nationalId: { type: String, default: "" },
      patientId: { type: String, default: "" },
      phone: { type: String, default: "" },
      gender: { type: String, default: "" },
      passwordSalt: { type: String, default: "" },
      passwordHash: { type: String, default: "" }
    },
    otpHash: {
      type: String,
      required: true
    },
    signupTokenHash: {
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

SignupOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SignupOtpSchema.index({ phoneNormalized: 1, createdAt: -1 });
SignupOtpSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("SignupOtp", SignupOtpSchema);
