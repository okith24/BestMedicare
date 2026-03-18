const mongoose = require('mongoose');

const Appointment = require('./appointmentModel');
const { isSmsGatewayConfigured, sendSms } = require('../services/smsGateway');

const DEFAULT_REMINDER_LEAD_MINUTES = 60;
const DEFAULT_SCAN_INTERVAL_MS = 60 * 1000;
const DEFAULT_SEND_WINDOW_MINUTES = 5;
const ELIGIBLE_STATUSES = ['REQUESTED', 'CONFIRMED'];

let timer = null;
let running = false;

function parseBoolean(value, fallback = true) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function addDays(dateObj, days) {
  const next = new Date(dateObj.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function parseAppointmentDateTime(dateValue, timeValue) {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();

  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function formatShortAppointmentNumber(value) {
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

function buildReminderMessage(appointment) {
  const appointmentNumber = formatAppointmentSequence(appointment?.appointmentNumber);
  const department = formatDepartmentLabel(appointment?.service);
  const doctor = String(appointment?.doctor || 'your doctor').trim();
  const date = String(appointment?.date || '').trim();
  const time = formatSmsTime(appointment?.time);

  return [
    'Hello, this is a quick reminder about your upcoming appointment .',
    `Appointment No : ${appointmentNumber}`,
    `Department : ${department}`,
    `Doctor : ${doctor}`,
    `Date : ${date}`,
    `Time : ${time}`,
    'Please aim to arrive 10 minutes early. Thnak you!'
  ].join('\n');
}

async function markReminderSent(appointmentId) {
  await Appointment.updateOne(
    { _id: appointmentId, reminderSentAt: null },
    { $set: { reminderSentAt: new Date() } }
  );
}

function isReminderDue({ appointmentAt, nowMs, leadMinutes, sendWindowMinutes }) {
  const appointmentMs = appointmentAt.getTime();
  if (appointmentMs <= nowMs) return false;

  const targetReminderMs = appointmentMs - (leadMinutes * 60 * 1000);
  const diffMinutes = (nowMs - targetReminderMs) / 60000;

  return diffMinutes >= 0 && diffMinutes <= sendWindowMinutes;
}

async function processAppointmentReminders() {
  if (running) return;
  running = true;

  try {
    if (mongoose.connection.readyState !== 1) return;
    if (!isSmsGatewayConfigured()) return;

    const now = new Date();
    const leadMinutes = parsePositiveInt(
      process.env.APPOINTMENT_REMINDER_LEAD_MINUTES,
      DEFAULT_REMINDER_LEAD_MINUTES
    );
    const sendWindowMinutes = parsePositiveInt(
      process.env.APPOINTMENT_REMINDER_SEND_WINDOW_MINUTES,
      DEFAULT_SEND_WINDOW_MINUTES
    );

    const dateKeys = [toDateKey(now), toDateKey(addDays(now, 1))];

    const candidates = await Appointment.find({
      date: { $in: dateKeys },
      status: { $in: ELIGIBLE_STATUSES },
      reminderSentAt: null
    })
      .select('_id appointmentNumber phone doctor date time status reminderSentAt')
      .sort({ date: 1, time: 1, createdAt: 1 })
      .lean();

    const nowMs = now.getTime();
    let sentCount = 0;

    for (const appointment of candidates) {
      const appointmentAt = parseAppointmentDateTime(appointment.date, appointment.time);
      if (!appointmentAt) continue;

      if (
        !isReminderDue({
          appointmentAt,
          nowMs,
          leadMinutes,
          sendWindowMinutes
        })
      ) {
        continue;
      }

      const destination = String(appointment.phone || '').trim();
      if (!destination) continue;

      try {
        await sendSms({
          to: destination,
          message: buildReminderMessage(appointment)
        });
        await markReminderSent(appointment._id);
        sentCount += 1;
      } catch (err) {
        console.error(
          `[AppointmentReminder] Failed for appointment ${appointment._id}:`,
          err?.message || err
        );
      }
    }

    if (sentCount > 0) {
      console.log(`[AppointmentReminder] Sent ${sentCount} reminder(s).`);
    }
  } finally {
    running = false;
  }
}

function startAppointmentReminderService() {
  if (timer) return;

  const enabled = parseBoolean(process.env.APPOINTMENT_REMINDER_ENABLED, true);
  if (!enabled) {
    console.log('[AppointmentReminder] Service disabled by APPOINTMENT_REMINDER_ENABLED.');
    return;
  }

  const intervalMs = parsePositiveInt(
    process.env.APPOINTMENT_REMINDER_SCAN_INTERVAL_MS,
    DEFAULT_SCAN_INTERVAL_MS
  );

  timer = setInterval(() => {
    processAppointmentReminders().catch((err) => {
      console.error('[AppointmentReminder] Worker failed:', err?.message || err);
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  processAppointmentReminders().catch((err) => {
    console.error('[AppointmentReminder] Initial run failed:', err?.message || err);
  });

  console.log(
    `[AppointmentReminder] Service started (scan: ${intervalMs}ms, lead: ${parsePositiveInt(process.env.APPOINTMENT_REMINDER_LEAD_MINUTES, DEFAULT_REMINDER_LEAD_MINUTES)}min, window: ${parsePositiveInt(process.env.APPOINTMENT_REMINDER_SEND_WINDOW_MINUTES, DEFAULT_SEND_WINDOW_MINUTES)}min).`
  );
}

module.exports = {
  startAppointmentReminderService,
  processAppointmentReminders
};
