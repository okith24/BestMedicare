const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Appointment = require('../echanneling/appointmentModel');
const { attachAuth, requireAuth, requireStaff } = require('../auth/middleware');
const LOYALTY_DISCOUNT_PERCENT = 5;
const LOYALTY_DISCOUNT_POINTS_REQUIRED = 1;

function normalizePaymentMethod(value) {
  return String(value || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
}

function normalizePaymentStatus(value) {
  return String(value || '').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING';
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampPercent(value) {
  const n = toNumber(value);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function nonNegative(value) {
  const n = toNumber(value);
  return n < 0 ? 0 : n;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    description: String(item.description || '').trim() || 'Other',
    notes: String(item.notes || '').trim(),
    amount: nonNegative(item.amount)
  }));
}

function computeSubtotal(items) {
  return items.reduce((sum, item) => sum + nonNegative(item.amount), 0);
}

function computeTotals(items, discountPercentInput) {
  const subtotal = Number(computeSubtotal(items).toFixed(2));
  const discountPercent = clampPercent(discountPercentInput);
  const discountAmount = Number(((subtotal * discountPercent) / 100).toFixed(2));
  const total = Number(Math.max(0, subtotal - discountAmount).toFixed(2));
  return { subtotal, discountPercent, discountAmount, total };
}

async function getLoyaltyByEmail(email) {
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail) {
    return { visitsCount: 0, starPoints: 0 };
  }

  const visitsCount = await Appointment.countDocuments({
    bookedByEmail: safeEmail,
    $or: [{ status: 'COMPLETED' }, { paymentStatus: 'PAID' }]
  });
  return {
    visitsCount,
    starPoints: Math.floor(visitsCount / 10)
  };
}

function getLoyaltyDiscountPercent(loyalty) {
  return (Number(loyalty?.starPoints || 0) >= LOYALTY_DISCOUNT_POINTS_REQUIRED)
    ? LOYALTY_DISCOUNT_PERCENT
    : 0;
}

router.use(attachAuth);

router.get('/', requireAuth, async (req, res) => {
  try {
    const referenceNumber = String(req.query.referenceNumber || '').trim();
    const filter = {};
    if (req.authUser.role === 'patient') {
      filter.patientEmail = req.authUser.email;
    }

    if (referenceNumber) {
      const one = await Invoice.findOne({ ...filter, referenceNumber });
      return res.json(one);
    }

    const all = await Invoice.find(filter).sort({ updatedAt: -1 }).limit(50);
    res.json(all);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/lookup/patient', requireStaff, async (req, res) => {
  try {
    const rawName = String(req.query.name || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();
    const patientId = String(req.query.patientId || '').trim().toUpperCase();

    if (!rawName && !email && !patientId) {
      return res.status(400).json({ message: 'name, email, or patientId is required' });
    }

    const lookup = {};
    if (patientId) {
      lookup.patientId = patientId;
    } else if (email) {
      lookup.bookedByEmail = email;
    } else {
      lookup.name = { $regex: rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const appointment = await Appointment.findOne(lookup).sort({ createdAt: -1 });
    if (!appointment) {
      return res.json({
        found: false,
        patientName: rawName || '',
        patientId: patientId || '',
        patientEmail: email || '',
        appointmentNumber: '',
        appointmentId: '',
        loyalty: { visitsCount: 0, starPoints: 0 },
        eligibleDiscount: false
      });
    }

    const loyalty = await getLoyaltyByEmail(appointment.bookedByEmail);
    const loyaltyDiscountPercent = getLoyaltyDiscountPercent(loyalty);
    res.json({
      found: true,
      patientName: appointment.name || rawName || appointment.patientId || '',
      patientId: appointment.patientId || patientId || '',
      patientEmail: appointment.bookedByEmail || '',
      appointmentNumber: appointment.appointmentNumber || '',
      appointmentId: String(appointment._id),
      loyalty,
      discountPercent: loyaltyDiscountPercent,
      eligibleDiscount: loyaltyDiscountPercent > 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/upsert', requireStaff, async (req, res) => {
  try {
    const payload = req.body || {};
    const referenceNumber = String(payload.referenceNumber || '').trim();
    if (!referenceNumber) {
      return res.status(400).json({ message: 'referenceNumber is required' });
    }

    const items = sanitizeItems(payload.items);
    const draftIssueDate = String(payload.issueDate || '').trim() || todayIso();
    const { subtotal, discountPercent, discountAmount, total } = computeTotals(
      items,
      payload.discountPercent
    );

    const updated = await Invoice.findOneAndUpdate(
      { referenceNumber },
      {
        patientName: String(payload.patientName || '').trim(),
        patientId: String(payload.patientId || '').trim().toUpperCase(),
        patientEmail: String(payload.patientEmail || '').trim().toLowerCase(),
        appointmentNumber: String(payload.appointmentNumber || '').trim(),
        serviceDate: String(payload.serviceDate || '').trim(),
        issueDate: draftIssueDate,
        status: String(payload.status || 'Draft').trim(),
        paymentMethod: normalizePaymentMethod(payload.paymentMethod),
        paymentStatus: normalizePaymentStatus(payload.paymentStatus || 'PENDING'),
        subtotal,
        discountPercent,
        discountAmount,
        total,
        items
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/finalize', requireStaff, async (req, res) => {
  try {
    const payload = req.body || {};
    const referenceNumber = String(payload.referenceNumber || '').trim();
    if (!referenceNumber) {
      return res.status(400).json({ message: 'referenceNumber is required' });
    }

    const appointmentNumber = String(payload.appointmentNumber || '').trim();
    const appointmentId = String(payload.appointmentId || '').trim();

    let appointment = null;
    if (appointmentId) {
      appointment = await Appointment.findById(appointmentId);
    } else if (appointmentNumber) {
      appointment = await Appointment.findOne({ appointmentNumber });
    }

    const patientEmail = String(
      payload.patientEmail || appointment?.bookedByEmail || ''
    ).trim().toLowerCase();
    const patientId = String(
      payload.patientId || appointment?.patientId || ''
    ).trim().toUpperCase();
    const patientName = String(
      payload.patientName || appointment?.name || appointment?.patientId || ''
    ).trim();

    const loyalty = await getLoyaltyByEmail(patientEmail);
    const discountPercent = getLoyaltyDiscountPercent(loyalty);
    const items = sanitizeItems(payload.items);
    const { subtotal, discountAmount, total } = computeTotals(items, discountPercent);
    const paymentMethod = normalizePaymentMethod(payload.paymentMethod);
    const paymentStatus = 'PAID';
    const finalizedIssueDate = String(payload.issueDate || '').trim() || todayIso();

    const finalized = await Invoice.findOneAndUpdate(
      { referenceNumber },
      {
        patientName,
        patientId,
        patientEmail,
        appointmentId: appointment?._id || null,
        appointmentNumber: appointment?.appointmentNumber || appointmentNumber,
        serviceDate: String(payload.serviceDate || appointment?.date || '').trim(),
        issueDate: finalizedIssueDate,
        status: 'Finalized',
        paymentMethod,
        paymentStatus,
        subtotal,
        discountPercent,
        discountAmount,
        total,
        loyaltySnapshot: loyalty,
        submittedAt: new Date(),
        items
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (appointment) {
      appointment.invoiceReferenceNumber = finalized.referenceNumber;
      appointment.amount = total;
      appointment.paymentMethod = paymentMethod;
      appointment.paymentStatus = paymentStatus;
      if (paymentStatus === 'PAID' && appointment.status !== 'CANCELLED') {
        appointment.status = 'COMPLETED';
      }
      await appointment.save();
    }

    res.json(finalized);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
