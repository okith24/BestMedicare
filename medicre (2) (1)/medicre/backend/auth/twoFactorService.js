const TwoFactorAuth = require('../auth/twoFactorModel');
const { encrypt, decrypt } = require('../utils/encryption');
const totp = require('./totp');
const crypto = require('crypto');

/**
 * ============================================================
 * TWO-FACTOR AUTHENTICATION SERVICE
 * ============================================================
 * 
 * Business logic for 2FA operations
 * - Enable/disable 2FA
 * - Verify codes
 * - Manage backup codes
 * - Trusted device management
 */

/**
 * Enable 2FA for a user (setup phase)
 * Returns secret and QR code for authenticator app
 */
async function initiateSetup(userId, userModel = 'User', email) {
  // Check if user already has 2FA
  let twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    twoFactor = new TwoFactorAuth({
      userId,
      userModel,
      type: 'totp'
    });
  }

  // Generate new secret
  const secret = totp.generateSecret();
  const otpauthUrl = totp.generateQrCode(secret, email, 'Hospital Management System');

  // Store secret temporarily (not yet committed)
  // In a real app, you'd use a temporary storage with TTL
  twoFactor.totpSecret = secret;
  twoFactor.qrCodeDataUrl = otpauthUrl;

  return {
    secret,
    qrCode: otpauthUrl,
    backupCodeCount: 10,
    message: 'Scan QR code with authenticator app. You will need to verify a code to complete setup.'
  };
}

/**
 * Complete 2FA setup after user verifies a code
 * @param {string} userId - User ID
 * @param {string} totpCode - 6-digit code from authenticator
 * @param {string} userModel - Which user model (User, StaffUser, etc.)
 * @returns {object} Backup codes for recovery
 */
async function completeSetup(userId, totpCode, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor || !twoFactor.totpSecret) {
    throw new Error('2FA setup not initiated');
  }

  // Verify the code
  const verification = totp.verify(twoFactor.totpSecret, totpCode);

  if (!verification.valid) {
    throw new Error('Invalid authentication code. Please try again.');
  }

  // Setup is complete - enable 2FA
  twoFactor.isEnabled = true;
  twoFactor.enabledAt = new Date();

  // Generate backup codes
  const backupCodes = totp.generateBackupCodes(10);
  twoFactor.backupCodes = backupCodes.map(code => ({
    codeHash: totp.hashBackupCode(code),
    used: false
  }));
  twoFactor.backupCodesRemaining = 10;

  await twoFactor.save();

  // Return plain backup codes (only time they're visible!)
  return {
    backupCodes,
    message: 'Two-factor authentication is now enabled. Save your backup codes in a safe place.'
  };
}

/**
 * Verify a TOTP code during login
 */
async function verifyCode(userId, totpCode, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor || !twoFactor.isEnabled) {
    throw new Error('Two-factor authentication not enabled');
  }

  // Check if account is locked
  if (twoFactor.isLocked()) {
    throw new Error('Account locked due to too many failed attempts. Try again in 15 minutes.');
  }

  // Verify the code
  const verification = totp.verify(twoFactor.totpSecret, totpCode);

  if (!verification.valid) {
    await twoFactor.recordFailedAttempt();
    throw new Error(
      `Invalid authentication code. ${
        twoFactor.maxFailedAttempts - twoFactor.failedAttempts
      } attempts remaining.`
    );
  }

  // Success!
  await twoFactor.recordSuccessfulAttempt();

  return {
    verified: true,
    message: 'Two-factor verified successfully'
  };
}

/**
 * Verify a backup code (for account recovery)
 */
async function verifyBackupCode(userId, backupCode, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor || !twoFactor.isEnabled) {
    throw new Error('Two-factor authentication not enabled');
  }

  const codeHash = totp.hashBackupCode(backupCode);
  const isValid = twoFactor.isBackupCodeValid(codeHash);

  if (!isValid) {
    await twoFactor.recordFailedAttempt();
    throw new Error('Invalid backup code');
  }

  // Use the backup code
  await twoFactor.useBackupCode(codeHash);

  // Alert user if running low on backup codes
  if (twoFactor.backupCodesRemaining <= 2) {
    return {
      verified: true,
      warning: `Warning: Only ${twoFactor.backupCodesRemaining} backup codes remaining. Generate new codes in settings.`
    };
  }

  return {
    verified: true,
    message: 'Backup code verified successfully'
  };
}

/**
 * Disable 2FA for a user
 * Requires password verification for security
 */
async function disableTwoFactor(userId, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    throw new Error('Two-factor authentication not configured');
  }

  // Remove all sensitive data
  twoFactor.isEnabled = false;
  twoFactor.totpSecret = null;
  twoFactor.totpSecretIv = null;
  twoFactor.qrCodeDataUrl = null;
  twoFactor.backupCodes = [];
  twoFactor.backupCodesRemaining = 0;
  twoFactor.trustedDevices = [];

  await twoFactor.save();

  return {
    message: 'Two-factor authentication has been disabled'
  };
}

/**
 * Generate new backup codes
 * Used when user runs low or needs to regenerate
 */
async function generateNewBackupCodes(userId, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor || !twoFactor.isEnabled) {
    throw new Error('Two-factor authentication not enabled');
  }

  // Generate new codes
  const backupCodes = totp.generateBackupCodes(10);
  twoFactor.backupCodes = backupCodes.map(code => ({
    codeHash: totp.hashBackupCode(code),
    used: false
  }));
  twoFactor.backupCodesRemaining = 10;

  await twoFactor.save();

  // Return only once!
  return {
    backupCodes,
    message: 'New backup codes generated. Store them safely.'
  };
}

/**
 * Trust a device (skip 2FA on this device)
 */
async function trustDevice(userId, userModel = 'User', deviceId, deviceName, fingerprint) {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    const newTwoFactor = new TwoFactorAuth({ userId, userModel });
    await newTwoFactor.trustDevice(deviceId, deviceName, fingerprint);
    return { message: 'Device trusted' };
  }

  await twoFactor.trustDevice(deviceId, deviceName, fingerprint);

  return {
    message: 'Device trusted. You won\'t need to provide a 2FA code on this device.'
  };
}

/**
 * Check if device is trusted
 */
async function isDeviceTrusted(userId, userModel = 'User', deviceId, fingerprint) {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    return false;
  }

  return twoFactor.isDeviceTrusted(deviceId, fingerprint);
}

/**
 * Get all trusted devices for a user
 */
async function getTrustedDevices(userId, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    return [];
  }

  return twoFactor.getTrustedDevices().map(device => ({
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    trustedAt: device.trustedAt,
    lastUsedAt: device.lastUsedAt
  }));
}

/**
 * Revoke a trusted device
 */
async function revokeTrustedDevice(userId, userModel = 'User', deviceId) {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    throw new Error('No devices found');
  }

  await twoFactor.revokeTrustedDevice(deviceId);

  return {
    message: 'Device access revoked'
  };
}

/**
 * Get 2FA status for a user
 */
async function getTwoFactorStatus(userId, userModel = 'User') {
  const twoFactor = await TwoFactorAuth.findOne({ userId, userModel });

  if (!twoFactor) {
    return {
      enabled: false,
      configured: false,
      backupCodesRemaining: 0,
      trustedDevices: 0
    };
  }

  return {
    enabled: twoFactor.isEnabled,
    configured: twoFactor.isConfigured(),
    type: twoFactor.type,
    enabledAt: twoFactor.enabledAt,
    backupCodesRemaining: twoFactor.backupCodesRemaining,
    trustedDevices: twoFactor.getTrustedDevices().length,
    lastUsedAt: twoFactor.lastUsedAt
  };
}

/**
 * Generate device fingerprint (browser/device identification)
 * Used for trusted device detection
 */
function generateDeviceFingerprint(req) {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || ''
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(components)
    .digest('hex');
}

module.exports = {
  initiateSetup,
  completeSetup,
  verifyCode,
  verifyBackupCode,
  disableTwoFactor,
  generateNewBackupCodes,
  trustDevice,
  isDeviceTrusted,
  getTrustedDevices,
  revokeTrustedDevice,
  getTwoFactorStatus,
  generateDeviceFingerprint
};
