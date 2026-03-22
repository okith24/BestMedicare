const mongoose = require('mongoose');
const AppointmentCounter = require('./appointmentCounterModel');

const MAX_DAILY_APPOINTMENTS_PER_SERVICE = 100;

function pad2(v) {
  return String(v).padStart(2, '0');
}

function pad3(v) {
  return String(v).padStart(3, '0');
}

function normalizeServiceKey(service) {
  const normalized = String(service || 'OPD')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'OPD';
}

function normalizeDateKey(dateValue) {
  const raw = String(dateValue || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.replace(/-/g, '');
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}${pad2(parsed.getMonth() + 1)}${pad2(parsed.getDate())}`;
  }

  const now = new Date();
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
}

function createDailyLimitError(serviceKey) {
  const error = new Error(
    `Daily booking limit reached (${MAX_DAILY_APPOINTMENTS_PER_SERVICE}) for ${serviceKey}. Please choose another date or service.`
  );
  error.code = 'DAILY_BOOKING_LIMIT_REACHED';
  error.statusCode = 409;
  return error;
}

async function getNextDailySequence(counterKey, serviceKey) {
  while (true) {
    const updated = await AppointmentCounter.findOneAndUpdate(
      {
        key: counterKey,
        seq: { $lt: MAX_DAILY_APPOINTMENTS_PER_SERVICE }
      },
      { $inc: { seq: 1 } },
      { new: true }
    );

    if (updated) {
      return Number(updated.seq);
    }

    try {
      await AppointmentCounter.create({ key: counterKey, seq: 0 });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    const existing = await AppointmentCounter.findOne({ key: counterKey }).select('seq').lean();
    if (existing && Number(existing.seq) >= MAX_DAILY_APPOINTMENTS_PER_SERVICE) {
      throw createDailyLimitError(serviceKey);
    }
  }
}

async function generateAppointmentNumber({ date, service }) {
  const dateKey = normalizeDateKey(date);
  const serviceKey = normalizeServiceKey(service);
  const counterKey = `${dateKey}-${serviceKey}`;
  const sequence = await getNextDailySequence(counterKey, serviceKey);
  return `${serviceKey}-${dateKey}-${pad3(sequence)}`;
}

const AppointmentSchema = new mongoose.Schema(
  {
    appointmentNumber: { type: String, trim: true, unique: true, sparse: true },
    patientMode: { type: String, enum: ['id', 'name'], default: 'id' },
    patientId: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' },
    age: { type: Number, min: 0, max: 130, default: null },
    gender: { type: String, enum: ['male', 'female'], default: '' },
    phone: { type: String, trim: true, required: true },
    bookedByEmail: { type: String, trim: true, lowercase: true, required: true },
    service: { type: String, trim: true, required: true },
    doctor: { type: String, trim: true, required: true },
    date: { type: String, trim: true, required: true },
    time: { type: String, trim: true, required: true },
    note: { type: String, trim: true, default: '' },
    fee: { type: Number, default: 1500 },
    amount: { type: Number, default: 1500 },
    doctorCharge: { type: Number, default: 0 },
    hospitalCharge: { type: Number, default: 0 },
    invoiceReferenceNumber: { type: String, trim: true, default: '' },
    paymentStatus: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
    paymentMethod: { type: String, enum: ['cash', 'card'], default: 'cash' },
    reminderSentAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
      default: 'REQUESTED'
    }
  },
  { timestamps: true }
);

AppointmentSchema.pre('validate', async function setAppointmentNumber() {
  if (!this.isNew || this.appointmentNumber) return;
  this.appointmentNumber = await generateAppointmentNumber({
    date: this.date,
    service: this.service
  });
});

AppointmentSchema.index({ doctor: 1, date: 1, time: 1, status: 1 });
AppointmentSchema.index({ bookedByEmail: 1, date: 1 });
AppointmentSchema.index({ date: 1, time: 1, status: 1, reminderSentAt: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
