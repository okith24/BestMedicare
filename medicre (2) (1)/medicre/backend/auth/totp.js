const crypto = require('crypto');

/**
 * ============================================================
 * TOTP (Time-based One-Time Password) IMPLEMENTATION
 * ============================================================
 * 
 * RFC 6238 compliant TOTP for 2FA using authenticator apps:
 * - Google Authenticator
 * - Microsoft Authenticator
 * - Authy
 * - 1Password
 * - etc.
 */

const TOTP_WINDOW = 1; // 1 time window before/after (30 seconds) = 90 second validity
const TIME_STEP = 30; // 30 seconds per code
const DIGIT_COUNT = 6; // 6-digit codes

/**
 * Generate random TOTP secret
 * @returns {string} Base32-encoded secret (32 bytes)
 */
function generateSecret() {
  const bytes = crypto.randomBytes(32);
  return base32Encode(bytes);
}

/**
 * Create QR code data URL for authenticator setup
 * @param {string} secret - TOTP secret (base32)
 * @param {string} email - User's email
 * @param {string} issuer - App name (e.g., "Hospital Management")
 * @returns {string} QR code data URL (base64)
 */
function generateQrCode(secret, email, issuer = 'HospitalManagement') {
  // Format: otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER
  const label = `${issuer} (${email})`;
  const otpAuthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(
    issuer
  )}&algorithm=SHA1&digits=${DIGIT_COUNT}&period=${TIME_STEP}`;

  // For production, use a QR code library like 'qrcode'
  // For now, return the otpauth URL (frontend can generate QR code)
  return otpAuthUrl;
}

/**
 * Verify a TOTP code
 * @param {string} secret - Base32-encoded secret
 * @param {string} code - 6-digit code from user
 * @param {number} timestamp - (Optional) Unix timestamp to verify against
 * @returns {object} { valid: boolean, delta: number }
 */
function verify(secret, code, timestamp = Math.floor(Date.now() / 1000)) {
  if (!secret || !code) {
    return { valid: false, delta: null };
  }

  // Convert code to string and validate format
  const codeStr = String(code).trim();
  if (!/^\d{6}$/.test(codeStr)) {
    return { valid: false, delta: null };
  }

  try {
    const secretBytes = base32Decode(secret);
    const counter = Math.floor(timestamp / TIME_STEP);

    // Check current and adjacent time windows
    // This prevents slight clock skew from rejecting valid codes
    for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
      const testCounter = counter + i;
      const generatedCode = generateCode(secretBytes, testCounter);

      if (generatedCode === codeStr) {
        return {
          valid: true,
          delta: i // Which window matched
        };
      }
    }

    return { valid: false, delta: null };
  } catch (error) {
    console.error('TOTP verification error:', error);
    return { valid: false, delta: null };
  }
}

/**
 * Generate a TOTP code for a specific counter value
 * Internal function
 */
function generateCode(secretBytes, counter) {
  const counterBuffer = Buffer.alloc(8);
  // Big-endian encoding
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', secretBytes);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = digest[digest.length - 1] & 0xf;
  let otp = (digest[offset] & 0x7f) << 24;
  otp |= (digest[offset + 1] & 0xff) << 16;
  otp |= (digest[offset + 2] & 0xff) << 8;
  otp |= digest[offset + 3] & 0xff;

  otp %= 1000000;

  return String(otp).padStart(DIGIT_COUNT, '0');
}

/**
 * Generate current TOTP code (for testing/debugging only)
 * DO NOT use in production - only for server-side testing
 */
function getCurrentCode(secret) {
  try {
    const secretBytes = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / TIME_STEP);
    return generateCode(secretBytes, counter);
  } catch (error) {
    throw new Error(`Failed to generate code: ${error.message}`);
  }
}

/**
 * Generate backup codes for account recovery
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {string[]} Array of backup codes
 */
function generateBackupCodes(count = 10) {
  const codes = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto
      .randomBytes(6)
      .toString('hex')
      .toUpperCase()
      .substring(0, 8);

    codes.push(code);
  }

  return codes;
}

/**
 * Hash a backup code for storage
 */
function hashBackupCode(code) {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

// ============================================================
// BASE32 ENCODING/DECODING (for TOTP secret)
// ============================================================

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(encoded) {
  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < encoded.length; i++) {
    const index = BASE32_CHARS.indexOf(encoded[i]);
    if (index < 0) throw new Error(`Invalid base32 character: ${encoded[i]}`);

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

module.exports = {
  generateSecret,
  generateQrCode,
  verify,
  getCurrentCode,
  generateBackupCodes,
  hashBackupCode,
  TOTP_WINDOW,
  TIME_STEP,
  DIGIT_COUNT
};
