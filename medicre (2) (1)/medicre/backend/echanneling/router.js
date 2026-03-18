const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Appointment = require('./appointmentModel');
const { SERVICE_FEES, DOCTORS } = require('./constants');
const { attachAuth, requireAuth } = require('../auth/middleware');

function normalizeIncoming(payload = {}) {
  const service = String(payload.service || 'OPD').trim();
  const fee = Number(payload.fee) || SERVICE_FEES[service] || 1500;
  const paymentMethod = String(payload.paymentMethod || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
  const explicitPaymentStatus = String(payload.paymentStatus || '').trim();
  const gender = String(payload.gender || '').trim().toLowerCase() === 'female' ? 'female' : (String(payload.gender || '').trim().toLowerCase() === 'male' ? 'male' : '');

  return {
    patientMode: String(payload.patientMode || (payload.patientId ? 'id' : 'name')).toLowerCase() === 'name' ? 'name' : 'id',
    patientId: String(payload.patientId || '').trim().toUpperCase(),
    name: String(payload.name || '').trim(),
    age: payload.age === '' || payload.age === undefined || payload.age === null ? null : Number(payload.age),
    gender,
    phone: String(payload.phone || '').trim(),
    bookedByEmail: String(payload.bookedByEmail || 'guest@local').trim().toLowerCase(),
    service,
    doctor: String(payload.doctor || '').trim(),
    date: String(payload.date || '').trim(),
    time: String(payload.time || '').trim(),
    note: String(payload.note || '').trim(),
    fee,
    amount: fee,
    paymentStatus: explicitPaymentStatus
      ? (String(explicitPaymentStatus).toUpperCase() === 'PAID' ? 'PAID' : 'PENDING')
      : (paymentMethod === 'card' ? 'PAID' : 'PENDING'),
    paymentMethod,
    status: ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(String(payload.status || '').toUpperCase())
      ? String(payload.status).toUpperCase()
      : 'REQUESTED'
  };
}

function validateCreate(data) {
  if (!data.phone) return 'Phone is required';
  if (!data.gender) return 'Gender is required';
  if (!data.doctor) return 'Doctor is required';
  if (!data.date) return 'Date is required';
  if (!data.time) return 'Time is required';
  if (data.patientMode === 'id' && !data.patientId) return 'Patient ID is required';
  if (data.patientMode === 'name' && !data.name) return 'Full name is required';
  return '';
}

router.use(attachAuth);

router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database unavailable. Check MongoDB Atlas Network Access IP whitelist and try again.'
    });
  }
  next();
});

router.get('/meta', async (req, res) => {
  res.json({
    services: Object.entries(SERVICE_FEES).map(([name, fee]) => ({ name, fee })),
    doctors: DOCTORS,
    paymentMethods: ['cash', 'card']
  });
});

router.use(requireAuth);

router.post('/appointments', async (req, res) => {
  try {
    const data = normalizeIncoming(req.body || {});
    if (!data.patientId && req.authUser?.patientId) {
      data.patientId = String(req.authUser.patientId).trim().toUpperCase();
    }
    if (req.authUser?.email) {
      data.bookedByEmail = req.authUser.email;
    }
    const validationError = validateCreate(data);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const existingSlot = await Appointment.findOne({
      doctor: data.doctor,
      date: data.date,
      time: data.time,
      status: { $in: ['REQUESTED', 'CONFIRMED'] }
    });

    if (existingSlot) {
      return res.status(409).json({ message: 'This doctor already has an appointment for that time slot' });
    }

    const appointment = await Appointment.create(data);
    res.status(201).json(appointment);
  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const filter = {};

    if (req.authUser?.role === 'patient') {
      filter.bookedByEmail = req.authUser.email;
    } else if (req.query.email) {
      filter.bookedByEmail = String(req.query.email).toLowerCase();
    }
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.date) filter.date = String(req.query.date);
    if (req.query.doctor) filter.doctor = String(req.query.doctor);

    const appointments = await Appointment.find(filter).sort({ date: 1, time: 1, createdAt: -1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/appointments/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    res.json(appointment);
  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

router.patch('/appointments/:id', async (req, res) => {
  try {
    const allowed = ['patientId', 'name', 'age', 'gender', 'phone', 'service', 'doctor', 'date', 'time', 'note', 'paymentMethod', 'status'];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        patch[key] = req.body[key];
      }
    }

    const normalized = normalizeIncoming({ ...patch, bookedByEmail: req.body?.bookedByEmail || 'guest@local' });
    const finalPatch = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        finalPatch[key] = normalized[key];
      }
    }

    if (finalPatch.service) {
      finalPatch.fee = SERVICE_FEES[finalPatch.service] || normalized.fee;
      finalPatch.amount = finalPatch.fee;
    }

    const updated = await Appointment.findByIdAndUpdate(req.params.id, finalPatch, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Appointment not found' });

    res.json(updated);
  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

router.patch('/appointments/:id/payment', async (req, res) => {
  try {
    const paymentMethod = String(req.body?.paymentMethod || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
    const paymentStatus = String(req.body?.paymentStatus || 'PAID').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING';

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { paymentMethod, paymentStatus },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Appointment not found' });
    res.json(updated);
  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

router.patch('/appointments/:id/cancel', async (req, res) => {
  try {
    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'CANCELLED' },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Appointment not found' });
    res.json(updated);
  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;


