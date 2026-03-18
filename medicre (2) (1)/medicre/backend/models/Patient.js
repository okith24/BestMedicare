const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  department: { type: String, required: true },
  admittedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Patient', PatientSchema);