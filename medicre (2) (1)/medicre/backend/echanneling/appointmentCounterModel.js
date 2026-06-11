// Counter model used for appointment number sequencing.

const mongoose = require('mongoose');

// Stores the next sequence number for each date + service combination.
const AppointmentCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppointmentCounter', AppointmentCounterSchema);

