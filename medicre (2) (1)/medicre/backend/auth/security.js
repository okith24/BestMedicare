// Shared auth helpers for hashing, tokens, and session security.

const crypto = require("crypto");

const SALT_BYTES = 16;
const HASH_KEYLEN = 64;
const TOKEN_BYTES = 48;

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+0-9()\-\s]{7,20}$/;
const NATIONAL_ID_REGEX = /^(?:\d{12}|\d{9}V)$/i;

/*
==============================
EMAIL NORMALIZATION
==============================
*/

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/*

PASSWORD HASHING

*/

function hashPassword(password, saltHex) {
  const salt =
    saltHex || crypto.randomBytes(SALT_BYTES).toString("hex");

  // N=65536 is OWASP-recommended for medical applications storing PHI.
  const hash = crypto
    .scryptSync(String(password || ""), salt, HASH_KEYLEN, { N: 65536, r: 8, p: 1 })
    .toString("hex");

  return { salt, hash };
}

function verifyPassword(password, saltHex, expectedHashHex) {
  if (!password || !saltHex || !expectedHashHex) return false;
  try {
    const normalizedSalt = String(saltHex || "").trim();
    const normalizedExpectedHash = String(expectedHashHex || "").trim();

    if (!normalizedSalt || !normalizedExpectedHash) return false;

    const { hash } = hashPassword(password, normalizedSalt);

    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(normalizedExpectedHash, "hex");

    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/*
==============================
SESSION TOKENS
==============================
*/

function createSessionToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

/*
==============================
NATIONAL ID
==============================
*/

function normalizeNationalId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isValidNationalId(nationalId) {
  const value = normalizeNationalId(nationalId);
  return NATIONAL_ID_REGEX.test(value);
}

/*
==============================
EMAIL / PHONE VALIDATION
==============================
*/

function isValidEmail(email) {
  return SIMPLE_EMAIL_REGEX.test(normalizeEmail(email));
}

function isValidPhone(phone) {
  const value = String(phone || "").trim();
  if (!value) return false;
  return PHONE_REGEX.test(value);
}

/*
==============================
PATIENT ID GENERATION
==============================
*/

function buildPatientCodeFromName(name) {
  const letters = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (!letters) return "USER";

  if (letters.length >= 4) {
    return `${letters[0]}${letters[1]}${letters[2]}${letters[letters.length - 1]}`;
  }

  return letters.padEnd(4, "X");
}

function generatePatientId(name, nationalId) {
  const digits = normalizeNationalId(nationalId).replace(/\D/g, "");

  const numericPart = digits
    .slice(0, 6)
    .padEnd(6, "0");

  return `${buildPatientCodeFromName(name)}${numericPart}`;
}

/*
==============================
PASSWORD STRENGTH CHECK
==============================
*/

function isStrongPassword(password) {
  const p = String(password || "");

  if (p.length < 8) return false;
  if (!/[a-z]/.test(p)) return false;
  if (!/[A-Z]/.test(p)) return false;
  if (!/[0-9]/.test(p)) return false;
  if (!/[^A-Za-z0-9]/.test(p)) return false;

  return true;
}

/*
==============================
REMOVE SENSITIVE DATA
==============================
*/

function sanitizeUser(userDoc) {
  if (!userDoc) return null;

  return {
    id: String(userDoc._id),
    name: userDoc.name || "",
    username: userDoc.username || "",
    patientId: userDoc.patientId || "",
    email: userDoc.email || "",
    phone: userDoc.phone || "",
    phoneVerifiedAt: userDoc.phoneVerifiedAt || null,
    gender: userDoc.gender || "",
    department: userDoc.department || "",
    role: userDoc.role || "patient",
    createdAt: userDoc.createdAt || null
  };
}

/*
==============================
PRE-AUTH TOKENS (2FA step-up)
==============================
Short-lived HMAC tokens issued after password verification when 2FA is required.
They prove the caller passed the password check without creating a full session.
*/

const PRE_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

function createPreAuthToken(userId, userModel) {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || "fallback-change-me";
  const payload = `${userId}:${userModel}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

function verifyPreAuthToken(token) {
  try {
    const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || "fallback-change-me";
    const [b64, sig] = token.split(".");
    if (!b64 || !sig) return null;

    const payload = Buffer.from(b64, "base64url").toString("utf8");
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const [userId, userModel, tsStr] = payload.split(":");
    if (!userId || !userModel || !tsStr) return null;
    if (Date.now() - Number(tsStr) > PRE_AUTH_TTL_MS) return null;

    return { userId, userModel };
  } catch {
    return null;
  }
}

module.exports = {
  normalizeEmail,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashToken,
  isValidEmail,
  isValidPhone,
  normalizeNationalId,
  isValidNationalId,
  generatePatientId,
  isStrongPassword,
  sanitizeUser,
  createPreAuthToken,
  verifyPreAuthToken
};

