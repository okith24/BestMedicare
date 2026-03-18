const mongoose = require("mongoose");

const DoctorSchema = new mongoose.Schema(
  {
    doctorId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    consultation: { type: String, default: "" },
    consultationFee: { type: Number, default: 0 },
    availability: { type: Array, default: [] },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Doctor", DoctorSchema);