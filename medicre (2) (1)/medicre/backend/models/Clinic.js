const mongoose = require("mongoose");

const ClinicSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    departmentKey: {
      type: String,
      trim: true,
      default: ""
    },
    fee: {
      type: Number,
      default: 0
    },
    slotMinutes: {
      type: Number,
      default: 10
    },
    bookingWindowDays: {
      type: Number,
      default: 30
    },
    doctorRequired: {
      type: Boolean,
      default: true
    },
    availability: {
      type: Array,
      default: []
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Clinic", ClinicSchema);
