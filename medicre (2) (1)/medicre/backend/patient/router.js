const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Patient = require('../models/Patient');
const User = require('../auth/userModel');
const Appointment = require('../echanneling/appointmentModel');
const Invoice = require('../models/Invoice');

const { isSmsGatewayConfigured, sendSms } = require('../services/smsGateway');
const {
  getDateRange,
  getServiceDirectory,
  getSlotAvailability,
  isDateWithinWindow,
  normalizeServiceName,
  resolveServicePricing,
  resolveDoctorNameForBooking
} = require('../echanneling/bookingRules');

const {
  attachAuth,
  requireAuth,
  requirePatient
} = require('../auth/middleware');

/*
================================
UTILITY FUNCTIONS
================================
*/

function toDateTime(appointment) {
  if (!appointment?.date || !appointment?.time) return null;
  const d = new Date(`${appointment.date}T${appointment.time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizePaymentMethod(value) {
  return String(value || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
}

function normalizePaymentStatus(value) {
  return String(value || '').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING';
}

function resolvePatientName(appointment) {
  if (appointment?.name) return appointment.name;
  if (appointment?.patientId) return appointment.patientId;
  if (appointment?.bookedByEmail) return appointment.bookedByEmail;
  return 'Unknown';
}

function mapAppointment(appointment) {
  return {
    id: String(appointment._id),
    appointmentNumber: appointment.appointmentNumber || '',
    patientName: resolvePatientName(appointment),
    patientId: appointment.patientId || '',
    gender: appointment.gender || '',
    patientEmail: appointment.bookedByEmail || '',
    date: appointment.date,
    time: appointment.time,
    doctor: appointment.doctor,
    service: appointment.service,
    doctorCharge: Number(appointment.doctorCharge || 0),
    hospitalCharge: Number(appointment.hospitalCharge || 0),
    totalCharge: Number(appointment.amount || appointment.fee || 0),
    amount: appointment.amount,
    paymentStatus: appointment.paymentStatus,
    paymentMethod: appointment.paymentMethod,
    status: appointment.status,
    invoiceReferenceNumber: appointment.invoiceReferenceNumber || '',
    createdAt: appointment.createdAt
  };
}

function formatShortBookedNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const match = raw.match(/^([A-Z0-9-]+)-\d{8}-(\d{1,3})$/);
  if (!match) return raw;

  const service = match[1];
  const sequence = String(Number(match[2]) || 0).padStart(2, '0');
  return `${service} -${sequence}`;
}

function formatAppointmentSequence(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const match = raw.match(/^[A-Z0-9-]+-\d{8}-(\d{1,3})$/);
  if (match) {
    return String(Number(match[1]) || 0).padStart(2, '0');
  }

  const shortMatch = raw.match(/^[A-Z0-9-]+\s*-\s*(\d{1,3})$/);
  if (shortMatch) {
    return String(Number(shortMatch[1]) || 0).padStart(2, '0');
  }

  return raw;
}

function formatDepartmentLabel(value) {
  return String(value || '').trim().toUpperCase();
}

function formatSmsTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return raw;

  const hours24 = Number(match[1]);
  const minutes = match[2];
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes} ${suffix}`;
}

function buildAppointmentSmsMessage(appointment) {
  const bookedNo = formatAppointmentSequence(
    appointment?.appointmentNumber || String(appointment?._id || '')
  );
  const department = formatDepartmentLabel(appointment?.service);
  const doctor = String(appointment?.doctor || '').trim();
  const date = String(appointment?.date || '').trim();
  const time = formatSmsTime(appointment?.time);
  const paymentMethod = normalizePaymentMethod(appointment?.paymentMethod);

  if (paymentMethod === 'card') {
    return [
      'Your appointment is successfully booked!',
      `Appointment No : ${bookedNo}`,
      `Department : ${department}`,
      `Doctor : ${doctor}`,
      `Date : ${date}`,
      `Time : ${time}`,
      '',
      'We have successfully received your payment . Thank you for trusting us with your care. Wishing you good health!'
    ].join('\n');
  }

  return [
    'Your appointment is successfully booked!',
    `Appointment No : ${bookedNo}`,
    `Department : ${department}`,
    `Doctor : ${doctor}`,
    `Date : ${date}`,
    `Time : ${time}`,
    '',
    'Please settle your channeling fee at the hospital counter upon arrival. Thank you for trusting us with your care.',
    'Wishing you good health!'
  ].join('\n');
}

/*
================================
DATABASE CONNECTION CHECK
================================
*/

router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database unavailable'
    });
  }
  next();
});

router.get('/lookup/by-name', attachAuth, requireAuth, requirePatient, async (req, res) => {
  try {
    const queryName = String(req.query?.name || '').trim().toLowerCase();
    const currentName = String(req.authUser?.name || '').trim().toLowerCase();

    if (!queryName || !currentName) {
      return res.json({ found: false });
    }

    if (!currentName.includes(queryName) && !queryName.includes(currentName)) {
      return res.json({ found: false });
    }

    const account = await User.findById(req.authUser.id || req.authUser._id)
      .select('patientId gender phone name')
      .lean();

    if (!account) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      patientId: account.patientId || '',
      gender: account.gender || '',
      phone: account.phone || '',
      name: account.name || ''
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/echanneling/options', attachAuth, requireAuth, requirePatient, async (req, res) => {
  try {
    const requestedService = normalizeServiceName(req.query?.service || 'OPD');
    const requestedDate = String(req.query?.date || '').trim();
    const requestedDoctor = String(req.query?.doctor || '').trim();

    const { services, serviceConfig, doctors } = await getServiceDirectory(requestedService);

    if (!serviceConfig) {
      return res.status(404).json({ message: 'Echanneling service configuration not found' });
    }

    const selectedDoctor = serviceConfig.doctorRequired
      ? (doctors.find((item) => item.name === requestedDoctor)?.name || '')
      : resolveDoctorNameForBooking(serviceConfig, '');

    let slots = [];
    if (
      requestedDate
      && isDateWithinWindow(requestedDate, serviceConfig.bookingWindowDays)
      && (!serviceConfig.doctorRequired || selectedDoctor)
    ) {
      const availability = await getSlotAvailability({
        serviceConfig,
        doctorName: selectedDoctor,
        dateValue: requestedDate,
        doctorOptions: doctors
      });
      slots = availability.slots;
    }

    return res.json({
      services: services.map((item) => ({
        ...resolveServicePricing(item),
        name: item.service,
        fee: Number(item.fee || 0),
        doctorRequired: !!item.doctorRequired,
        slotMinutes: Number(item.slotMinutes || 10),
        bookingWindowDays: Number(item.bookingWindowDays || 30)
      })),
      service: {
        ...resolveServicePricing(serviceConfig),
        name: serviceConfig.service,
        fee: Number(serviceConfig.fee || 0),
        doctorRequired: !!serviceConfig.doctorRequired,
        slotMinutes: Number(serviceConfig.slotMinutes || 10),
        bookingWindowDays: Number(serviceConfig.bookingWindowDays || 30)
      },
      doctors: doctors.map((item) => ({
        name: item.name,
        doctorId: item.doctorId,
        consultation: item.consultation
      })),
      selectedDoctor,
      doctorDisabled: !serviceConfig.doctorRequired,
      dateRange: getDateRange(serviceConfig.bookingWindowDays),
      slots
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/*
================================
CREATE APPOINTMENT
================================
*/

router.post('/appointments', attachAuth, requireAuth, requirePatient, async (req, res) => {
  try {

    const authEmail = req.authUser.email;

    const requestedDoctor = String(req.body?.doctor || '').trim();
    const date = String(req.body?.date || '').trim();
    const time = String(req.body?.time || '').trim();
    const gender = String(req.body?.gender || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const service = normalizeServiceName(req.body?.service || 'OPD');
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const explicitPaymentStatus = String(req.body?.paymentStatus || '').trim();

    if (!date || !time || !phone) {
      return res.status(400).json({ message: 'Date, time and phone are required' });
    }

    if (!['male', 'female'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male or Female' });
    }

    const { serviceConfig, doctors } = await getServiceDirectory(service);

    if (!serviceConfig) {
      return res.status(400).json({ message: 'Selected service is not available' });
    }

    const doctor = resolveDoctorNameForBooking(serviceConfig, requestedDoctor);

    if (serviceConfig.doctorRequired && !doctor) {
      return res.status(400).json({ message: 'Doctor is required for the selected service' });
    }

    if (
      serviceConfig.doctorRequired
      && !doctors.find((item) => item.name === doctor)
    ) {
      return res.status(400).json({ message: 'Selected doctor is not available for that service' });
    }

    if (!isDateWithinWindow(date, serviceConfig.bookingWindowDays)) {
      return res.status(400).json({ message: 'Appointments can only be booked within the next one month' });
    }

    const availability = await getSlotAvailability({
      serviceConfig,
      doctorName: doctor,
      dateValue: date,
      doctorOptions: doctors
    });

    const selectedSlot = availability.slots.find((slot) => slot.value === time);
    if (!selectedSlot) {
      return res.status(400).json({ message: 'Selected time is outside the available schedule' });
    }

    if (!selectedSlot.available) {
      return res.status(409).json({
        message: 'This time slot has already been booked. Please choose another time.'
      });
    }

    const existingSlot = await Appointment.findOne(
      serviceConfig.doctorRequired
        ? {
            service,
            doctor,
            date,
            time,
            status: { $in: ['REQUESTED', 'CONFIRMED'] }
          }
        : {
            service,
            date,
            time,
            status: { $in: ['REQUESTED', 'CONFIRMED'] }
          }
    );

    if (existingSlot) {
      return res.status(409).json({
        message: 'This time slot has already been booked. Please choose another time.'
      });
    }

    const pricing = resolveServicePricing(serviceConfig);
    const fee = Number(pricing.fee || 0);

    const appointment = await Appointment.create({
      name: req.authUser.name,
      patientId: req.authUser.patientId,
      phone,
      gender,
      bookedByEmail: authEmail,
      service,
      doctor,
      date,
      time,
      amount: fee,
      fee,
      doctorCharge: Number(pricing.doctorCharge || 0),
      hospitalCharge: Number(pricing.hospitalCharge || 0),
      paymentStatus: explicitPaymentStatus
        ? normalizePaymentStatus(explicitPaymentStatus)
        : (paymentMethod === 'card' ? 'PAID' : 'PENDING'),
      paymentMethod,
      status: 'REQUESTED'
    });

    const responsePayload = mapAppointment(appointment);

    if (isSmsGatewayConfigured()) {
      try {
        await sendSms({
          to: phone,
          message: buildAppointmentSmsMessage(appointment)
        });
        responsePayload.smsNotification = { sent: true };
      } catch (smsErr) {
        console.error('appointment sms error', smsErr?.message || smsErr);
        responsePayload.smsNotification = {
          sent: false,
          message: smsErr?.message || 'Appointment booked but SMS notification failed'
        };
      }
    }

    res.status(201).json(responsePayload);

  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

/*
================================
GET APPOINTMENTS
================================
*/

router.get('/appointments', attachAuth, requireAuth, async (req, res) => {
  try {

    const filter = {};

    if (req.authUser.role === 'patient') {
      filter.bookedByEmail = req.authUser.email;
    }

    const appointments = await Appointment
      .find(filter)
      .sort({ date: 1, time: 1 });

    res.json(appointments.map(mapAppointment));

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/*
================================
UPDATE PAYMENT
================================
*/

router.patch('/appointments/:id/payment', attachAuth, requireAuth, async (req, res) => {

  try {

    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (
      req.authUser.role === 'patient' &&
      appointment.bookedByEmail !== req.authUser.email
    ) {
      return res.status(403).json({
        message: 'Not allowed to update this appointment'
      });
    }

    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const explicitPaymentStatus = String(req.body?.paymentStatus || '').trim();

    appointment.paymentMethod = paymentMethod;
    appointment.paymentStatus = explicitPaymentStatus
      ? normalizePaymentStatus(explicitPaymentStatus)
      : (paymentMethod === 'card' ? 'PAID' : 'PENDING');

    await appointment.save();

    res.json(mapAppointment(appointment));

  } catch (err) {
    if (err?.code === 'DAILY_BOOKING_LIMIT_REACHED') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ message: err.message });
  }
});

/*
================================
PATIENT DASHBOARD
================================
*/

router.get('/dashboard', attachAuth, requirePatient, async (req, res) => {

  try {

    const appointments = await Appointment.find({
      bookedByEmail: req.authUser.email
    }).sort({ createdAt: -1 });

    const now = new Date();

    const upcoming =
      appointments
        .map(a => ({ a, dt: toDateTime(a) }))
        .filter(x => x.dt && x.dt >= now)
        .sort((a, b) => a.dt - b.dt)[0]?.a || null;

    const invoices = await Invoice.find({
      patientEmail: req.authUser.email,
      status: 'Finalized'
    });

    res.json({
      user: req.authUser,
      upcoming: upcoming ? mapAppointment(upcoming) : null,
      records: appointments.map(mapAppointment),
      invoices
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;



