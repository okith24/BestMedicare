const Clinic = require("../models/Clinic");
const Doctor = require("../models/Doctor");
const StaffUser = require("../models/StaffUser");
const Appointment = require("./appointmentModel");

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const DEFAULT_CLINIC_SERVICES = [
  {
    service: "OPD",
    departmentKey: "opd",
    doctorCharge: 1000,
    hospitalCharge: 350,
    fee: 1350,
    slotMinutes: 10,
    bookingWindowDays: 30,
    doctorRequired: false,
    availability: [{ day: "*", start: "00:00", end: "23:50" }]
  },
  {
    service: "Psychiatric",
    departmentKey: "psychiatric",
    doctorCharge: 6000,
    hospitalCharge: 1000,
    fee: 7000,
    slotMinutes: 10,
    bookingWindowDays: 30,
    doctorRequired: true,
    availability: [{ day: "*", start: "17:00", end: "20:00" }]
  },
  {
    service: "Physiotherapy",
    departmentKey: "physiotherapy",
    doctorCharge: 4000,
    hospitalCharge: 1000,
    fee: 5000,
    slotMinutes: 10,
    bookingWindowDays: 30,
    doctorRequired: true,
    availability: [{ day: "*", start: "10:00", end: "20:00" }]
  },
  {
    service: "Counselling",
    departmentKey: "counselling",
    doctorCharge: 5000,
    hospitalCharge: 1500,
    fee: 6500,
    slotMinutes: 10,
    bookingWindowDays: 30,
    doctorRequired: true,
    availability: [{ day: "*", start: "16:00", end: "22:00" }]
  },
  {
    service: "Aesthetic",
    departmentKey: "aesthetic",
    doctorCharge: 2500,
    hospitalCharge: 350,
    fee: 2850,
    slotMinutes: 10,
    bookingWindowDays: 30,
    doctorRequired: true,
    availability: [{ day: "*", start: "17:00", end: "21:00" }]
  }
];

function getDefaultServicePricing(serviceName) {
  const normalized = normalizeServiceName(serviceName);
  const match = DEFAULT_CLINIC_SERVICES.find((item) => item.service === normalized);
  return {
    doctorCharge: Number(match?.doctorCharge || 0),
    hospitalCharge: Number(match?.hospitalCharge || 0),
    fee: Number(match?.fee || 0)
  };
}

function resolveServicePricing(serviceConfig) {
  const fallback = getDefaultServicePricing(serviceConfig?.service);
  const doctorCharge = Number(
    serviceConfig?.doctorCharge ?? fallback.doctorCharge ?? 0
  );
  const hospitalCharge = Number(
    serviceConfig?.hospitalCharge ?? fallback.hospitalCharge ?? 0
  );
  const fee = Number(
    serviceConfig?.fee ?? (doctorCharge + hospitalCharge) ?? fallback.fee ?? 0
  );

  return {
    doctorCharge,
    hospitalCharge,
    fee: fee || doctorCharge + hospitalCharge
  };
}

function normalizeServiceName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "OPD";

  const map = {
    opd: "OPD",
    psychiatric: "Psychiatric",
    psychiatry: "Psychiatric",
    physiotherapy: "Physiotherapy",
    counselling: "Counselling",
    counseling: "Counselling",
    aesthetic: "Aesthetic",
    "lab testing": "Lab Testing",
    labtesting: "Lab Testing",
    lab: "Lab Testing"
  };

  return map[raw] || String(value || "").trim();
}

function normalizeDepartmentKey(value) {
  const service = normalizeServiceName(value);
  const map = {
    OPD: "opd",
    Psychiatric: "psychiatric",
    Physiotherapy: "physiotherapy",
    Counselling: "counselling",
    Aesthetic: "aesthetic",
    "Lab Testing": "lab-testing"
  };
  return map[service] || String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms)\.?\s+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDoctorToken(value) {
  return normalizeName(value);
}

function buildDoctorIdFromStaff(staffDoc) {
  const rawId = String(staffDoc?._id || "").slice(-6).toUpperCase();
  return `DOC-${rawId || "000000"}`;
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(bookingWindowDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const max = new Date(today.getTime());
  max.setDate(max.getDate() + Math.max(1, Number(bookingWindowDays || 30)));

  return {
    minDate: toDateKey(today),
    maxDate: toDateKey(max)
  };
}

function isDateWithinWindow(dateValue, bookingWindowDays) {
  const target = parseDateOnly(dateValue);
  if (!target) return false;

  const { minDate, maxDate } = getDateRange(bookingWindowDays);
  return dateValue >= minDate && dateValue <= maxDate;
}

function parseTimeToMinutes(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatTimeLabel(value) {
  const total = parseTimeToMinutes(value);
  if (total === null) return String(value || "").trim();

  const hours24 = Math.floor(total / 60);
  const minutes = String(total % 60).padStart(2, "0");
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${suffix}`;
}

function normalizeDayToken(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "*") return "*";
  if (DAY_NAMES.includes(raw)) return raw;

  const short = {
    sun: "sunday",
    mon: "monday",
    tue: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    fri: "friday",
    sat: "saturday"
  };

  return short[raw] || raw;
}

function entryMatchesDate(entry, dateObj, dateValue) {
  if (!entry || typeof entry !== "object") return true;

  const rawDate = String(entry.date || "").trim();
  if (rawDate) return rawDate === dateValue;

  const rawDates = Array.isArray(entry.dates) ? entry.dates.map((item) => String(item || "").trim()) : [];
  if (rawDates.length) return rawDates.includes(dateValue);

  const weekday = DAY_NAMES[dateObj.getDay()];
  const day = normalizeDayToken(entry.day || entry.dayName || entry.weekdayName);
  if (day && day !== "*") return day === weekday;

  const days = Array.isArray(entry.days) ? entry.days.map(normalizeDayToken) : [];
  if (days.length) return days.includes("*") || days.includes(weekday);

  const weekdayIndex = Number(entry.weekday);
  if (Number.isInteger(weekdayIndex)) return weekdayIndex === dateObj.getDay();

  return true;
}

function entryMatchesDoctor(entry, doctorName, doctorId) {
  if (!entry || typeof entry !== "object") return true;

  const requestedDoctorName = normalizeDoctorToken(doctorName);
  const requestedDoctorId = String(doctorId || "").trim().toUpperCase();

  const entryDoctorName = normalizeDoctorToken(entry.doctor || entry.doctorName || entry.name);
  const entryDoctorId = String(entry.doctorId || "").trim().toUpperCase();

  if (!entryDoctorName && !entryDoctorId) return true;
  if (requestedDoctorId && entryDoctorId) return requestedDoctorId === entryDoctorId;
  if (requestedDoctorName && entryDoctorName) return requestedDoctorName === entryDoctorName;
  return false;
}

function pushWindowSlots(times, startTime, endTime, slotMinutes) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const gap = Math.max(5, Number(slotMinutes || 10));

  if (start === null || end === null || end < start) return;

  for (let cursor = start; cursor <= end; cursor += gap) {
    times.add(minutesToTime(cursor));
  }
}

function collectAvailabilitySlots(availability, dateValue, slotMinutes) {
  const targetDate = parseDateOnly(dateValue);
  if (!targetDate) return [];

  const times = new Set();
  const list = Array.isArray(availability) ? availability : [];

  for (const item of list) {
    if (typeof item === "string") {
      const range = item.match(/^([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)$/);
      if (!range) continue;
      pushWindowSlots(
        times,
        `${range[1].padStart(2, "0")}:${range[2]}`,
        `${range[3].padStart(2, "0")}:${range[4]}`,
        slotMinutes
      );
      continue;
    }

    if (!item || typeof item !== "object") continue;
    if (!entryMatchesDate(item, targetDate, dateValue)) continue;

    const explicitSlots = Array.isArray(item.slots)
      ? item.slots.map((slot) => String(slot || "").trim()).filter(Boolean)
      : [];

    if (explicitSlots.length) {
      explicitSlots.forEach((slot) => times.add(slot));
      continue;
    }

    const startTime = item.start || item.startTime || item.from;
    const endTime = item.end || item.endTime || item.to;
    if (startTime && endTime) {
      pushWindowSlots(times, startTime, endTime, slotMinutes);
    }
  }

  return Array.from(times).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
}

function getClinicDoctorSpecificAvailability(serviceConfig, doctorName, doctorId) {
  const availabilityList = Array.isArray(serviceConfig?.availability) ? serviceConfig.availability : [];
  const matches = availabilityList.filter((entry) => entryMatchesDoctor(entry, doctorName, doctorId));
  return matches.length ? matches : [];
}

async function ensureClinicServices() {
  const existing = await Clinic.find({}).lean();
  const existingMap = new Map(
    existing.map((item) => [normalizeServiceName(item.service), item])
  );

  const missing = DEFAULT_CLINIC_SERVICES.filter(
    (item) => !existingMap.has(normalizeServiceName(item.service))
  );

  if (missing.length) {
    await Clinic.insertMany(
      missing.map((item) => ({
        ...item,
        departmentKey: normalizeDepartmentKey(item.departmentKey || item.service),
        fee: Number(item.fee || 0),
        doctorCharge: Number(item.doctorCharge || 0),
        hospitalCharge: Number(item.hospitalCharge || 0)
      })),
      { ordered: false }
    ).catch(() => null);
  }

  const clinics = await Clinic.find({ isActive: { $ne: false } })
    .sort({ service: 1 })
    .lean();

  return clinics.map((item) => ({
    ...resolveServicePricing(item),
    ...item,
    service: normalizeServiceName(item.service),
    departmentKey: normalizeDepartmentKey(item.departmentKey || item.service),
    slotMinutes: Math.max(5, Number(item.slotMinutes || 10)),
    bookingWindowDays: Math.max(1, Number(item.bookingWindowDays || 30))
  }));
}

function buildDoctorLookup(doctors) {
  const map = new Map();
  for (const doctor of doctors || []) {
    const key = normalizeName(doctor?.name);
    if (key && !map.has(key)) {
      map.set(key, doctor);
    }
  }
  return map;
}

async function getDoctorOptionsForService(serviceConfig) {
  if (!serviceConfig?.doctorRequired) return [];

  const departmentKey = normalizeDepartmentKey(serviceConfig.departmentKey || serviceConfig.service);
  const [staffDoctors, doctorDocs] = await Promise.all([
    StaffUser.find({
      role: "doctor",
      isActive: { $ne: false },
      department: departmentKey
    })
      .select("_id name department")
      .sort({ name: 1 })
      .lean(),
    Doctor.find({ isActive: { $ne: false } })
      .select("doctorId name consultation consultationFee availability")
      .lean()
  ]);

  const doctorLookup = buildDoctorLookup(doctorDocs);

  return staffDoctors.map((staffDoc) => {
    const match = doctorLookup.get(normalizeName(staffDoc.name));
    const pricing = resolveServicePricing(serviceConfig);
    return {
      doctorId: match?.doctorId || buildDoctorIdFromStaff(staffDoc),
      name: staffDoc.name,
      department: staffDoc.department,
      consultation: match?.consultation || serviceConfig.service,
      consultationFee: Number(match?.consultationFee || pricing.doctorCharge || 0),
      availability: Array.isArray(match?.availability) ? match.availability : []
    };
  });
}

async function getServiceDirectory(selectedService) {
  const services = await ensureClinicServices();
  const fallbackService = services.find((item) => item.service === "OPD") || services[0] || null;
  const normalizedService = normalizeServiceName(selectedService || fallbackService?.service || "OPD");
  const serviceConfig = services.find((item) => item.service === normalizedService) || fallbackService;
  const doctors = serviceConfig ? await getDoctorOptionsForService(serviceConfig) : [];

  return {
    services,
    serviceConfig,
    doctors
  };
}

function getBookedSlotQuery(serviceConfig, doctorName, dateValue) {
  const base = {
    date: dateValue,
    status: { $in: ["REQUESTED", "CONFIRMED"] }
  };

  if (!serviceConfig?.doctorRequired) {
    return {
      ...base,
      service: serviceConfig?.service || "OPD"
    };
  }

  return {
    ...base,
    service: serviceConfig?.service,
    doctor: doctorName
  };
}

async function getBookedTimesForSelection(serviceConfig, doctorName, dateValue) {
  const query = getBookedSlotQuery(serviceConfig, doctorName, dateValue);
  const appointments = await Appointment.find(query)
    .select("time")
    .lean();

  return new Set(
    appointments
      .map((item) => String(item?.time || "").trim())
      .filter(Boolean)
  );
}

async function getSlotAvailability({ serviceConfig, doctorName, dateValue, doctorOptions }) {
  if (!serviceConfig || !dateValue) {
    return { slots: [], bookedTimes: new Set() };
  }

  const slotMinutes = Math.max(5, Number(serviceConfig.slotMinutes || 10));
  let baseAvailability = Array.isArray(serviceConfig.availability) ? serviceConfig.availability : [];

  if (serviceConfig.doctorRequired) {
    const selectedDoctor = (doctorOptions || []).find((item) => item.name === doctorName);
    const clinicDoctorAvailability = getClinicDoctorSpecificAvailability(
      serviceConfig,
      doctorName,
      selectedDoctor?.doctorId
    );
    const doctorAvailability = Array.isArray(selectedDoctor?.availability) ? selectedDoctor.availability : [];

    if (clinicDoctorAvailability.length) {
      baseAvailability = clinicDoctorAvailability;
    } else if (doctorAvailability.length) {
      baseAvailability = doctorAvailability;
    }
  }

  const availableTimes = collectAvailabilitySlots(baseAvailability, dateValue, slotMinutes);
  const bookedTimes = await getBookedTimesForSelection(serviceConfig, doctorName, dateValue);

  return {
    bookedTimes,
    slots: availableTimes.map((time) => ({
      value: time,
      label: formatTimeLabel(time),
      available: !bookedTimes.has(time)
    }))
  };
}

function resolveDoctorNameForBooking(serviceConfig, requestedDoctor) {
  if (!serviceConfig?.doctorRequired) return "OPD Duty Doctor";
  return String(requestedDoctor || "").trim();
}

module.exports = {
  DEFAULT_CLINIC_SERVICES,
  ensureClinicServices,
  formatTimeLabel,
  getDateRange,
  getServiceDirectory,
  getSlotAvailability,
  isDateWithinWindow,
  normalizeDepartmentKey,
  normalizeServiceName,
  parseDateOnly,
  resolveServicePricing,
  resolveDoctorNameForBooking
};
