const mongoose = require('mongoose');

/**
 * ============================================================
 * TWO-FACTOR AUTHENTICATION MODEL
 * ============================================================
 * 
 * Stores 2FA configuration for users
 * - TOTP secret (Time-based One-Time Password)
 * - Backup codes for account recovery
 * - 2FA status and device trust info
 */

const twoFactorSchema = new mongoose.Schema(
  {
    // ============================================================
    // USER REFERENCE
    // ============================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    userModel: {
      type: String,
      required: true,
      enum: ['User', 'StaffUser', 'Staff'],
      default: 'User'
    },

    // ============================================================
    // 2FA STATUS
    // ============================================================

    /**
     * Is 2FA enabled for this user?
     */
    isEnabled: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * Type of 2FA
     * totp: Time-based One-Time Password (authenticator app)
     * sms: SMS-based codes
     */
    type: {
      type: String,
      enum: ['totp', 'sms'],
      default: 'totp'
    },

    // ============================================================
    // TOTP CONFIGURATION
    // ============================================================

    /**
     * TOTP Secret (encrypted)
     * Used to generate codes in authenticator apps (Google Authenticator, Authy, etc.)
     */
    totpSecret: {
      type: String,
      sparse: true,
      maxlength: 255
    },

    /**
     * TOTP Secret IV (for decryption)
     */
    totpSecretIv: {
      type: String,
      sparse: true,
      maxlength: 64
    },

    /**
     * QR code data URL (for initial setup)
     * Generated when 2FA is enabled
     */
    qrCodeDataUrl: {
      type: String,
      sparse: true,
      maxlength: 5000
    },

    /**
     * When was 2FA enabled?
     */
    enabledAt: {
      type: Date,
      sparse: true
    },

    /**
     * When was 2FA last used?
     */
    lastUsedAt: {
      type: Date,
      sparse: true
    },

    // ============================================================
    // BACKUP CODES (For account recovery)
    // ============================================================

    /**
     * Backup codes (hashed)
     * Each code can be used once
     * Format: [{ code: hash, usedAt: date, used: boolean }]
     */
    backupCodes: [
      {
        codeHash: {
          type: String,
          required: true
        },
        used: {
          type: Boolean,
          default: false
        },
        usedAt: {
          type: Date,
          sparse: true
        }
      }
    ],

    /**
     * Number of backup codes remaining
     * Cached for quick access
     */
    backupCodesRemaining: {
      type: Number,
      default: 0
    },

    // ============================================================
    // TRUSTED DEVICES (Optional but recommended)
    // ============================================================

    /**
     * Devices that don't need 2FA verification
     * Format: { deviceId, deviceName, lastUsedAt, trustedAt }
     */
    trustedDevices: [
      {
        deviceId: {
          type: String,
          required: true
        },
        deviceName: {
          type: String,
          maxlength: 100
        },
        fingerprint: {
          type: String,
          required: true
        },
        trustedAt: {
          type: Date,
          default: Date.now
        },
        lastUsedAt: {
          type: Date,
          default: Date.now
        },
        revoked: {
          type: Boolean,
          default: false
        }
      }
    ],

    // ============================================================
    // SETTINGS & PREFERENCES
    // ============================================================

    /**
     * Require 2FA on every login?
     * If false, can use trusted devices to skip 2FA
     */
    requireOnEveryLogin: {
      type: Boolean,
      default: true
    },

    /**
     * Grace period before enforcement
     * Some systems give users time to set up authenticator
     */
    enforcedAt: {
      type: Date,
      sparse: true
    },

    /**
     * Failed 2FA attempts
     * Lock account after too many failures
     */
    failedAttempts: {
      type: Number,
      default: 0
    },

    /**
     * Maximum failed attempts before lockout
     */
    maxFailedAttempts: {
      type: Number,
      default: 5
    },

    /**
     * Is account locked due to failed attempts?
     */
    locked: {
      type: Boolean,
      default: false
    },

    /**
     * When will account auto-unlock?
     */
    lockedUntil: {
      type: Date,
      sparse: true
    }
  },
  {
    timestamps: true,
    collection: 'twoFactorAuth'
  }
);

// ============================================================
// INDEXES
// ============================================================

twoFactorSchema.index({ userId: 1, userModel: 1 });
twoFactorSchema.index({ isEnabled: 1, createdAt: -1 });
twoFactorSchema.index({ locked: 1 });

// ============================================================
// INSTANCE METHODS
// ============================================================

/**
 * Check if 2FA is properly configured and enabled
 */
twoFactorSchema.methods.isConfigured = function() {
  return this.isEnabled && (this.totpSecret || this.type === 'sms');
};

/**
 * Check if account is locked
 */
twoFactorSchema.methods.isLocked = function() {
  if (!this.locked) return false;
  if (!this.lockedUntil) return true;

  const now = new Date();
  if (now > this.lockedUntil) {
    return false; // Lock expired
  }

  return true;
};

/**
 * Record a failed 2FA attempt
 */
twoFactorSchema.methods.recordFailedAttempt = async function() {
  this.failedAttempts = (this.failedAttempts || 0) + 1;

  if (this.failedAttempts >= this.maxFailedAttempts) {
    this.locked = true;
    const lockoutDuration = 15 * 60 * 1000; // 15 minutes
    this.lockedUntil = new Date(Date.now() + lockoutDuration);
  }

  return this.save();
};

/**
 * Reset failed attempts on successful verification
 */
twoFactorSchema.methods.recordSuccessfulAttempt = async function() {
  this.failedAttempts = 0;
  this.locked = false;
  this.lockedUntil = null;
  this.lastUsedAt = new Date();

  return this.save();
};

/**
 * Get remaining backup codes count
 */
twoFactorSchema.methods.getBackupCodesRemaining = function() {
  return this.backupCodes.filter(bc => !bc.used).length;
};

/**
 * Check if backup code is valid and unused
 */
twoFactorSchema.methods.isBackupCodeValid = function(codeHash) {
  const code = this.backupCodes.find(bc => bc.codeHash === codeHash);
  return code && !code.used;
};

/**
 * Use a backup code (mark as used)
 */
twoFactorSchema.methods.useBackupCode = async function(codeHash) {
  const code = this.backupCodes.find(bc => bc.codeHash === codeHash);
  if (!code || code.used) {
    throw new Error('Invalid or already used backup code');
  }

  code.used = true;
  code.usedAt = new Date();
  this.backupCodesRemaining = this.getBackupCodesRemaining();

  return this.save();
};

/**
 * Trust a device (skip 2FA on this device)
 */
twoFactorSchema.methods.trustDevice = async function(deviceId, deviceName, fingerprint) {
  // Remove if already trusted
  this.trustedDevices = this.trustedDevices.filter(d => d.deviceId !== deviceId);

  this.trustedDevices.push({
    deviceId,
    deviceName,
    fingerprint,
    trustedAt: new Date(),
    lastUsedAt: new Date()
  });

  return this.save();
};

/**
 * Check if device is trusted
 */
twoFactorSchema.methods.isDeviceTrusted = function(deviceId, fingerprint) {
  const device = this.trustedDevices.find(
    d => d.deviceId === deviceId && d.fingerprint === fingerprint && !d.revoked
  );

  if (device) {
    device.lastUsedAt = new Date();
    return true;
  }

  return false;
};

/**
 * Revoke a trusted device
 */
twoFactorSchema.methods.revokeTrustedDevice = async function(deviceId) {
  const device = this.trustedDevices.find(d => d.deviceId === deviceId);
  if (device) {
    device.revoked = true;
  }

  return this.save();
};

/**
 * Get all trusted devices
 */
twoFactorSchema.methods.getTrustedDevices = function() {
  return this.trustedDevices.filter(d => !d.revoked);
};

module.exports = mongoose.model('TwoFactorAuth', twoFactorSchema);
