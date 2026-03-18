const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Appointment = require('../echanneling/appointmentModel');
const Invoice = require('../models/Invoice');
const { SERVICE_FEES } = require('../echanneling/constants');
const { attachAuth, requireStaff } = require('../auth/middleware');

/*
==============================
UTILITY FUNCTIONS
==============================
*/

function toIsoDate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toMonthKey(date = new Date()) {
  return toIsoDate(date).slice(0, 7);
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
    patientEmail: appointment.bookedByEmail || '',
    date: appointment.date,
    time: appointment.time,
    doctor: appointment.doctor,
    service: appointment.service,
    amount: appointment.amount,
    paymentStatus: appointment.paymentStatus,
    paymentMethod: appointment.paymentMethod,
    status: appointment.status,
    invoiceReferenceNumber: appointment.invoiceReferenceNumber || '',
    createdAt: appointment.createdAt
  };
}

function isTreatedAppointment(appointment) {
  return appointment?.status === 'COMPLETED' || appointment?.paymentStatus === 'PAID';
}

/*
==============================
AUTH + STAFF ACCESS
==============================
*/

router.use(attachAuth, requireStaff);

/*
==============================
DB CONNECTION CHECK
==============================
*/

router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database unavailable'
    });
  }
  next();
});

/*
==============================
STAFF DASHBOARD
==============================
*/

router.get('/dashboard', async (req, res) => {

  try {

    const queryDate = req.query.date ? new Date(`${req.query.date}T00:00:00`) : new Date();
    if (isNaN(queryDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }
    const today = toIsoDate(queryDate);

    // Calculate weekly range (Monday to Sunday)
    // Use the original timestamp to create independent copies to avoid mutation bugs
    const baseTime = queryDate.getTime();
    const day = queryDate.getDay();
    const diffToMonday = queryDate.getDate() - day + (day === 0 ? -6 : 1);

    const startOfWeek = new Date(baseTime);
    startOfWeek.setDate(diffToMonday);

    const endOfWeek = new Date(baseTime);
    endOfWeek.setDate(diffToMonday + 6);

    const startOfWeekStr = toIsoDate(startOfWeek);
    const endOfWeekStr = toIsoDate(endOfWeek);

    const [dailyAppointments, weeklyAppointments] = await Promise.all([
      Appointment.find({ date: today }).sort({ time: 1 }),
      Appointment.find({
        date: { $gte: startOfWeekStr, $lte: endOfWeekStr }
      })
    ]);

    const treated = dailyAppointments.filter(a => isTreatedAppointment(a)).length;

    // Calculate department summary from weekly appointments
    const deptCounts = {};
    weeklyAppointments.forEach(app => {
        const dept = app.service || 'OPD';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });

    const departments = Object.entries(deptCounts).map(([name, count]) => ({
        name,
        count
    }));

    res.json({
      date: today,
      weeklyRange: { start: startOfWeekStr, end: endOfWeekStr },
      overview: {
        totalAppointmentsToday: dailyAppointments.length,
        treatedToday: treated,
        growthPercent: 0 // Placeholder logic 
      },
      departments,
      appointments: dailyAppointments.map(mapAppointment)
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

/*
==============================
CANCEL APPOINTMENT
==============================
*/

router.patch('/appointments/:id/cancel', async (req, res) => {

  try {

    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      id,
      { status: 'CANCELLED' },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json(mapAppointment(updated));

  } catch (err) {
    res.status(400).json({ message: err.message });
  }

});

/*
==============================
DAILY REPORT
==============================
*/

router.get('/reports/daily', async (req, res) => {

  try {

    const date = String(req.query.date || toIsoDate(new Date()));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }

    const appointments = await Appointment
      .find({ date })
      .sort({ time: 1 });

    const treated = appointments.filter(a => isTreatedAppointment(a));
    const cancelled = appointments.filter(a => a.status === 'CANCELLED');

    res.json({
      date,
      totals: {
        totalAppointments: appointments.length,
        treated: treated.length,
        cancelled: cancelled.length
      },
      treatedAppointments: treated.map(mapAppointment),
      cancelledAppointments: cancelled.map(mapAppointment)
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

/*
==============================
MONTHLY REPORT
==============================
*/

router.get('/reports/monthly', async (req, res) => {

  try {

    const month = String(req.query.month || toMonthKey(new Date()));

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    const [appointments, invoices] = await Promise.all([
      Appointment.find({ date: { $regex: `^${month}` } }),
      Invoice.find({ issueDate: { $regex: `^${month}` }, status: 'Finalized' })
    ]);

    const revenue = invoices.reduce((sum, x) => sum + Number(x.total || 0), 0);

    res.json({
      month,
      totals: {
        totalAppointments: appointments.length,
        treated: appointments.filter(a => isTreatedAppointment(a)).length,
        cancelled: appointments.filter(a => a.status === 'CANCELLED').length,
        revenue
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }

});

module.exports = router;