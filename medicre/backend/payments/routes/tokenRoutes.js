const express = require('express');
const router = express.Router();

// Model imports
const PaymentToken = require('../models/PaymentToken');
const PaymentAudit = require('../models/PaymentAudit');

// Utility imports
const { encryptToken, decryptToken } = require('../tokenization');

/**
 * ============================================================
 * TOKEN ROUTES - SAVED PAYMENT METHODS MANAGEMENT
 * ============================================================
 * 
 * GET    /api/tokens                    - List patient tokens
 * POST   /api/tokens                    - Save new token
 * GET    /api/tokens/:id                - Get token details
 * DELETE /api/tokens/:id                - Revoke token
 * POST   /api/tokens/:id/default        - Set as default
 * POST   /api/tokens/:id/verify         - Verify token (optional)
 */

/**
 * These routes manage Cybersource tokens (NOT raw card numbers)
 * Tokens are safely encrypted before storage
 * Display methods return only last 4 digits and brand
 */

/**
 * ============================================================
 * HELPER RESPONSE FUNCTIONS
 * ============================================================
 */

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}

function sendError(res, message, statusCode = 400, details = null) {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      details,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * ============================================================
 * ROUTE: GET /api/tokens
 * ============================================================
 * 
 * List saved payment tokens for patient
 * 
 * Query Parameters:
 *   status: "active,expired" - Filter by status
 * 
 * Response:
 * {
 *   "tokens": [
 *     {
 *       "id": "token-uuid",
 *       "cardLast4": "4242",
 *       "cardBrand": "Visa",
 *       "expiryMonth": 12,
 *       "expiryYear": 2025,
 *       "isDefault": true,
 *       "nickname": "Work Card",
 *       "status": "active",
 *       "createdAt": "2024-01-01T00:00:00Z",
 *       "lastUsedAt": "2024-01-20T10:30:00Z",
 *       "expiresSoon": false
 *     }
 *   ]
 * }
 */
router.get('/', async (req, res) => {
  try {
    // Get patient ID from authenticated user
    const patientId = req.user?.id || req.query.patientId;
    if (!patientId) {
      return sendError(res, 'Patient ID required', 401);
    }

    const { status } = req.query;

    // Use PaymentToken.findActiveByPatient()
    let query = PaymentToken.findActiveByPatient(patientId);
    
    if (status) {
      const statuses = status.split(',');
      query = PaymentToken.find({ patientId, tokenStatus: { $in: statuses } });
    }

    const tokens = await query.exec();

    // Map to safe display format
    const displayTokens = tokens.map(token => ({
      id: token._id,
      cardLast4: token.cardLast4,
      cardBrand: token.cardBrand,
      expiryMonth: token.expiryMonth,
      expiryYear: token.expiryYear,
      isDefault: token.isDefault,
      nickname: token.nickname,
      status: token.tokenStatus,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      expiresSoon: token.expiresSoon(),
      usageCount: token.usageCount
    }));

    return sendSuccess(res, {
      tokens: displayTokens,
      count: displayTokens.length
    });

  } catch (error) {
    console.error('List tokens error:', error.message);
    return sendError(
      res,
      'Failed to retrieve tokens',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: POST /api/tokens
 * ============================================================
 * 
 * Save new payment token
 * 
 * Request Body:
 * {
 *   "cybersourceToken": "...",
 *   "cardLast4": "4242",
 *   "cardBrand": "Visa",
 *   "expiryMonth": 12,
 *   "expiryYear": 2025,
 *   "nickname": "Work Card",
 *   "makeDefault": false
 * }
 * 
 * Response:
 * {
 *   "id": "token-uuid",
 *   "cardLast4": "4242",
 *   "cardBrand": "Visa",
 *   "status": "active",
 *   "message": "Token saved successfully"
 * }
 */
router.post('/', async (req, res) => {
  try {
    // Get patient ID from authenticated user
    const patientId = req.user?.id || req.body.patientId;
    if (!patientId) {
      return sendError(res, 'Patient ID required', 401);
    }

    const {
      cybersourceToken,
      cardLast4,
      cardBrand,
      expiryMonth,
      expiryYear,
      nickname,
      makeDefault = false
    } = req.body;

    // Validate input
    if (!cybersourceToken || !cardLast4 || !cardBrand) {
      return sendError(res, 'Missing required token fields', 400);
    }

    // Encrypt the Cybersource token
    const encryptionKey = process.env.PAYMENT_TOKEN_ENCRYPTION_KEY;
    if (!encryptionKey) {
      console.error('Encryption key not configured');
      return sendError(res, 'Token encryption not configured', 500);
    }

    const encrypted = encryptToken(cybersourceToken, encryptionKey);

    // Create PaymentToken record
    const token = await PaymentToken.create({
      patientId,
      cybersourceToken: encrypted.encrypted,
      encryptionIv: encrypted.iv,
      encryptionAlgo: 'aes-256-cbc',
      cardLast4,
      cardBrand,
      expiryMonth,
      expiryYear,
      nickname: nickname || `${cardBrand} ****${cardLast4}`,
      tokenStatus: 'active',
      isDefault: makeDefault,
      expiresAt: new Date(expiryYear, expiryMonth - 1, 28) // EOM
    });

    // If makeDefault, unset previous default
    if (makeDefault) {
      await PaymentToken.updateMany(
        { patientId, _id: { $ne: token._id }, isDefault: true },
        { isDefault: false }
      );
    }

    // Log token save event
    await PaymentAudit.create({
      eventType: 'token_saved',
      status: 'success',
      severity: 'info',
      paymentTokenId: token._id,
      description: `Payment token saved: ${cardBrand} ****${cardLast4}`,
      reason: 'Customer saved payment method'
    });

    // Return safe display data
    return sendSuccess(
      res,
      {
        id: token._id,
        cardLast4: token.cardLast4,
        cardBrand: token.cardBrand,
        expiryMonth: token.expiryMonth,
        expiryYear: token.expiryYear,
        nickname: token.nickname,
        status: token.tokenStatus,
        isDefault: token.isDefault,
        expiresSoon: token.expiresSoon(),
        message: 'Token saved successfully'
      },
      201
    );

  } catch (error) {
    console.error('Save token error:', error.message);
    return sendError(
      res,
      'Failed to save token',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: GET /api/tokens/:id
 * ============================================================
 * 
 * Get token details
 * 
 * Response:
 * {
 *   "id": "token-uuid",
 *   "cardLast4": "4242",
 *   "cardBrand": "Visa",
 *   "expiryMonth": 12,
 *   "expiryYear": 2025,
 *   "nickname": "Work Card",
 *   "status": "active",
 *   "isDefault": true,
 *   "usageCount": 25,
 *   "lastUsedAt": "2024-01-20T10:30:00Z",
 *   "createdAt": "2024-01-01T00:00:00Z",
 *   "expiresSoon": false
 * }
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patientId = req.user?.id || req.query.patientId;

    // Find token
    const token = await PaymentToken.findById(id);
    if (!token || token.patientId !== patientId) {
      return sendError(res, 'Token not found', 404);
    }

    // Return safe display data
    return sendSuccess(res, {
      id: token._id,
      cardLast4: token.cardLast4,
      cardBrand: token.cardBrand,
      expiryMonth: token.expiryMonth,
      expiryYear: token.expiryYear,
      nickname: token.nickname,
      status: token.tokenStatus,
      isDefault: token.isDefault,
      usageCount: token.usageCount,
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      expiresSoon: token.expiresSoon(),
      expiresAt: token.expiresAt
    });

  } catch (error) {
    console.error('Get token error:', error.message);
    return sendError(
      res,
      'Failed to retrieve token',
      404,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: DELETE /api/tokens/:id
 * ============================================================
 * 
 * Revoke/delete saved token
 * 
 * Request Body:
 * {
 *   "reason": "Card expired" // Optional
 * }
 * 
 * Response:
 * {
 *   "id": "token-uuid",
 *   "status": "revoked",
 *   "message": "Token revoked successfully"
 * }
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const patientId = req.user?.id || req.query.patientId;

    // Find token
    const token = await PaymentToken.findById(id);
    if (!token || token.patientId !== patientId) {
      return sendError(res, 'Token not found', 404);
    }

    // Revoke token
    await token.revoke(reason || 'User requested');

    // If was default, assign default to another token
    if (token.isDefault) {
      const nextDefault = await PaymentToken.findOne({
        patientId,
        tokenStatus: 'active',
        _id: { $ne: id }
      });

      if (nextDefault) {
        await nextDefault.setAsDefault();
      }
    }

    // Log revocation
    await PaymentAudit.create({
      eventType: 'token_revoked',
      status: 'success',
      severity: 'info',
      paymentTokenId: token._id,
      description: `Payment token revoked: ${token.cardBrand} ****${token.cardLast4}`,
      reason: reason || 'User requested',
      revocationData: {
        reason: reason || 'User requested',
        wasDefault: token.isDefault
      }
    });

    return sendSuccess(res, {
      id: token._id,
      status: 'revoked',
      reason: reason || 'User requested',
      revokedAt: new Date().toISOString(),
      message: 'Token revoked successfully'
    });

  } catch (error) {
    console.error('Revoke token error:', error.message);
    return sendError(
      res,
      'Failed to revoke token',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: POST /api/tokens/:id/default
 * ============================================================
 * 
 * Set token as default payment method
 * 
 * Response:
 * {
 *   "id": "token-uuid",
 *   "isDefault": true,
 *   "message": "Token set as default"
 * }
 */
router.post('/:id/default', async (req, res) => {
  try {
    const { id } = req.params;
    const patientId = req.user?.id || req.query.patientId;

    // Find token
    const token = await PaymentToken.findById(id);
    if (!token || token.patientId !== patientId) {
      return sendError(res, 'Token not found', 404);
    }

    // Verify token is active
    if (!token.isActive()) {
      return sendError(res, 'Token is not active', 400);
    }

    // Set as default
    await token.setAsDefault();

    // Remove default from other tokens
    await PaymentToken.updateMany(
      { patientId, _id: { $ne: id }, isDefault: true },
      { isDefault: false }
    );

    // Log change
    await PaymentAudit.create({
      eventType: 'default_token_changed',
      status: 'success',
      severity: 'info',
      paymentTokenId: token._id,
      description: `Default payment method changed to: ${token.cardBrand} ****${token.cardLast4}`
    });

    return sendSuccess(res, {
      id: token._id,
      isDefault: true,
      message: 'Token set as default'
    });

  } catch (error) {
    console.error('Set default token error:', error.message);
    return sendError(
      res,
      'Failed to set default token',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: POST /api/tokens/:id/verify
 * ============================================================
 * 
 * Verify token is still valid
 * Optional: Run small transaction to verify
 * 
 * Response:
 * {
 *   "id": "token-uuid",
 *   "isValid": true,
 *   "expiresAt": "2025-12-31",
 *   "message": "Token verified successfully"
 * }
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const patientId = req.user?.id || req.query.patientId;

    // Find token
    const token = await PaymentToken.findById(id);
    if (!token || token.patientId !== patientId) {
      return sendError(res, 'Token not found', 404);
    }

    // Check validity
    const isValid = token.isActive() && !token.isExpired();
    const isExpired = token.isExpired();

    if (isExpired) {
      await token.tokenStatus = 'expired';
      await token.save();
    }

    // Log verification
    await PaymentAudit.create({
      eventType: 'token_verified',
      status: isValid ? 'success' : 'failed',
      severity: isValid ? 'info' : 'warning',
      paymentTokenId: token._id,
      description: `Token verification: ${isValid ? 'Valid' : 'Invalid'}`
    });

    return sendSuccess(res, {
      id: token._id,
      isValid,
      isExpired,
      expiresAt: token.expiresAt?.toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      message: isValid ? 'Token verified successfully' : 'Token is invalid or expired'
    });

  } catch (error) {
    console.error('Verify token error:', error.message);
    return sendError(
      res,
      'Failed to verify token',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: POST /api/tokens/batch-check
 * ============================================================
 * 
 * Check multiple tokens for expiration (admin only for batch operations)
 * 
 * Response:
 * {
 *   "expiringSoon": 45,
 *   "expired": 12,
 *   "active": 2043
 * }
 */
router.post('/batch-check', async (req, res) => {
  try {
    // TODO: Implementation
    // 1. Verify user is admin
    // 2. Find all tokens
    // 3. Check expiresSoon() for each
    // 4. Check isExpired() for each
    // 5. Generate report
    // 6. Optionally: Send email notifications for expiring tokens

    // Placeholder response
    return sendSuccess(res, {
      expiringSoon: 45,
      expired: 12,
      active: 2043,
      checked: 2100
    });
  } catch (error) {
    console.error('Batch check error:', error.message);
    return sendError(
      res,
      'Failed to check tokens',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = router;
