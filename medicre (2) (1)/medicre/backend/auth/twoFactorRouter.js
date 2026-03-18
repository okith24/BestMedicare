const express = require('express');
const router = express.Router();
const { requireAuth } = require('./middleware');
const twoFactorService = require('./twoFactorService');
const { set2FACookie, clearCookie } = require('../middleware/cookieConfig');
const { logAudit, logSecurityEvent } = require('../middleware/audit');

/**
 * ============================================================
 * TWO-FACTOR AUTHENTICATION ROUTES
 * ============================================================
 */

/**
 * GET /api/auth/2fa/status
 * Get current 2FA status for logged-in user
 */
router.get('/2fa/status', requireAuth, async (req, res) => {
  try {
    const status = await twoFactorService.getTwoFactorStatus(
      req.authUser._id,
      req.authUser.userModel || 'User'
    );

    await logAudit(req, 'auth', '2FA_STATUS_CHECK', {
      description: 'User checked 2FA status',
      result: 'success'
    });

    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/setup/initiate
 * Start 2FA setup process
 * Returns QR code and secret
 */
router.post('/2fa/setup/initiate', requireAuth, async (req, res) => {
  try {
    const setup = await twoFactorService.initiateSetup(
      req.authUser._id,
      req.authUser.userModel || 'User',
      req.authUser.email || req.authUser.phone
    );

    // Don't log the secret - it's sensitive
    await logAudit(req, 'auth', '2FA_SETUP_INITIATED', {
      description: 'User initiated 2FA setup',
      result: 'success',
      securityFlag: false
    });

    res.json({
      secret: setup.secret,
      qrCode: setup.qrCode,
      message: setup.message
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/setup/complete
 * Complete 2FA setup by verifying a code
 * Body: { code: "123456" }
 */
router.post('/2fa/setup/complete', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authentication code required' });
    }

    const result = await twoFactorService.completeSetup(
      req.authUser._id,
      code,
      req.authUser.userModel || 'User'
    );

    await logAudit(req, 'auth', '2FA_ENABLED', {
      description: '2FA successfully enabled',
      result: 'success',
      securityFlag: false,
      severity: 'low',
      requiresReview: false
    });

    // Set 2FA verified cookie
    set2FACookie(res, 'twoFAVerified', 'true');

    res.json({
      enabled: true,
      backupCodes: result.backupCodes,
      message: result.message,
      // Provide instructions for storing codes
      instructions: 'Save these backup codes in a secure location. They can be used to access your account if you lose access to your authenticator device.'
    });
  } catch (error) {
    await logAudit(req, 'auth', '2FA_SETUP_FAILED', {
      description: '2FA setup verification failed',
      result: 'failure',
      errorMessage: error.message,
      securityFlag: true,
      severity: 'medium'
    });

    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Verify a TOTP code during login or session
 * Body: { code: "123456" }
 * Response: Sets 2FA cookie
 */
router.post('/2fa/verify', async (req, res) => {
  try {
    const { code, userId, userModel } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ error: 'Code and userId required' });
    }

    if (!code.match(/^\d{6}$/)) {
      return res.status(400).json({ error: 'Code must be 6 digits' });
    }

    const result = await twoFactorService.verifyCode(
      userId,
      code,
      userModel || 'User'
    );

    // Set 2FA verified cookie (valid for 5 minutes during login)
    set2FACookie(res, 'twoFAVerified', 'true');

    // Log successful 2FA
    await logAudit(req, 'auth', '2FA_VERIFIED', {
      description: 'User successfully verified 2FA code',
      result: 'success',
      userId
    });

    res.json(result);
  } catch (error) {
    await logSecurityEvent(req, '2FA_VERIFICATION_FAILED', 'invalid_code', 'medium');

    res.status(401).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/backup-verify
 * Verify a backup code (for recovery)
 * Body: { code: "BACKUP123456" }
 */
router.post('/2fa/backup-verify', async (req, res) => {
  try {
    const { code, userId, userModel } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ error: 'Code and userId required' });
    }

    const result = await twoFactorService.verifyBackupCode(
      userId,
      code.toUpperCase(),
      userModel || 'User'
    );

    set2FACookie(res, 'twoFAVerified', 'true');

    await logSecurityEvent(req, '2FA_BACKUP_CODE_USED', 'backup_code_authentication', 'low');

    res.json(result);
  } catch (error) {
    await logSecurityEvent(req, '2FA_BACKUP_CODE_INVALID', 'invalid_backup_code', 'high');

    res.status(401).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA for user
 * Requires authentication
 */
router.post('/2fa/disable', requireAuth, async (req, res) => {
  try {
    const result = await twoFactorService.disableTwoFactor(
      req.authUser._id,
      req.authUser.userModel || 'User'
    );

    await logSecurityEvent(req, '2FA_DISABLED', 'user_disabled_2fa', 'high');

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/backup-codes/regenerate
 * Generate new backup codes
 */
router.post('/2fa/backup-codes/regenerate', requireAuth, async (req, res) => {
  try {
    const result = await twoFactorService.generateNewBackupCodes(
      req.authUser._id,
      req.authUser.userModel || 'User'
    );

    await logAudit(req, 'auth', '2FA_BACKUP_CODES_REGENERATED', {
      description: 'User generated new backup codes',
      result: 'success',
      securityFlag: true,
      severity: 'low'
    });

    res.json({
      backupCodes: result.backupCodes,
      message: result.message,
      warning: 'Old backup codes can no longer be used'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/2fa/devices
 * Get all trusted devices
 */
router.get('/2fa/devices', requireAuth, async (req, res) => {
  try {
    const devices = await twoFactorService.getTrustedDevices(
      req.authUser._id,
      req.authUser.userModel || 'User'
    );

    res.json({
      devices,
      count: devices.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/2fa/device/trust
 * Trust current device (skip 2FA on this device)
 * Body: { deviceName: "My iPhone" }
 */
router.post('/2fa/device/trust', requireAuth, async (req, res) => {
  try {
    const { deviceName } = req.body;
    const fingerprint = twoFactorService.generateDeviceFingerprint(req);
    const deviceId = require('crypto')
      .randomBytes(16)
      .toString('hex');

    await twoFactorService.trustDevice(
      req.authUser._id,
      req.authUser.userModel || 'User',
      deviceId,
      deviceName || 'Trusted Device',
      fingerprint
    );

    // Set device cookie
    require('../middleware/cookieConfig').setSessionCookie(res, 'deviceFingerprint', fingerprint);

    await logAudit(req, 'auth', 'DEVICE_TRUSTED', {
      description: `Device "${deviceName}" added to trusted devices`,
      result: 'success'
    });

    res.json({
      message: 'Device trusted successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/2fa/device/:deviceId
 * Revoke a trusted device
 */
router.delete('/2fa/device/:deviceId', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;

    await twoFactorService.revokeTrustedDevice(
      req.authUser._id,
      req.authUser.userModel || 'User',
      deviceId
    );

    await logAudit(req, 'auth', 'DEVICE_REVOKED', {
      description: 'Trusted device revoked',
      result: 'success'
    });

    res.json({
      message: 'Device access revoked'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
