const crypto = require('crypto');

/**
 * ============================================================
 * CSRF PROTECTION MIDDLEWARE
 * ============================================================
 * 
 * Prevents Cross-Site Request Forgery attacks
 * Uses Synchronizer Token Pattern (double-submit validation)
 * 
 * How it works:
 * 1. Server generates unique token per session
 * 2. Token stored in session
 * 3. Token sent to frontend
 * 4. Frontend includes token in payment request
 * 5. Server validates token matches session
 * 
 * Attack prevented:
 * - Attacker tricks user to click malicious link
 * - Malicious form submits payment without user's consent
 * - CSRF token mismatch = request rejected
 */

const TOKEN_LENGTH = 32; // 256-bit tokens
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate new CSRF token
 * @returns {String} Random token in hex format
 */
function generateCSRFToken() {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware: Generate CSRF token for payment form
 * Use on GET endpoints that serve payment forms
 * 
 * Usage:
 * app.get('/api/payment/form', requireAuth, csrfProtection.generateToken, (req, res) => {
 *   res.json({ csrfToken: req.csrfToken });
 * });
 */
const generateToken = (req, res, next) => {
  try {
    // Initialize session if needed
    if (!req.session) {
      req.session = {};
    }

    // Check if token already exists and is valid
    if (req.session.csrfToken && req.session.csrfTokenExpiry) {
      if (Date.now() < req.session.csrfTokenExpiry) {
        // Token still valid, reuse it
        req.csrfToken = req.session.csrfToken;
        return next();
      }
    }

    // Generate new token
    const token = generateCSRFToken();
    const expiry = Date.now() + TOKEN_TTL_MS;

    req.session.csrfToken = token;
    req.session.csrfTokenExpiry = expiry;
    req.csrfToken = token;

    next();
  } catch (error) {
    console.error('CSRF token generation error:', error.message);
    return res.status(500).json({ error: 'Failed to generate CSRF token' });
  }
};

/**
 * Middleware: Validate CSRF token on payment submissions
 * Use on POST endpoints that process payments
 * 
 * Usage:
 * app.post('/api/payments/charge', 
 *   requireAuth, 
 *   csrfProtection.validateToken, 
 *   (req, res) => { ... }
 * );
 * 
 * Token can come from:
 * 1. req.body.csrfToken (form data)
 * 2. req.body._csrf (alternative field name)
 * 3. X-CSRF-Token header
 * 4. X-XSRF-Token header
 */
const validateToken = (req, res, next) => {
  try {
    // Get token from various sources
    const tokenFromBody = req.body?.csrfToken || req.body?._csrf;
    const tokenFromHeader = 
      req.headers['x-csrf-token'] || 
      req.headers['x-xsrf-token'];

    const providedToken = tokenFromBody || tokenFromHeader;

    // Check if token was provided
    if (!providedToken) {
      console.warn('CSRF: No token provided in request');
      return res.status(403).json({
        error: 'CSRF token required',
        code: 'CSRF_MISSING'
      });
    }

    // Check if session exists
    if (!req.session || !req.session.csrfToken) {
      console.warn('CSRF: No session token found');
      return res.status(403).json({
        error: 'Session expired, please refresh',
        code: 'CSRF_SESSION_EXPIRED'
      });
    }

    // Check if token has expired
    if (req.session.csrfTokenExpiry && Date.now() > req.session.csrfTokenExpiry) {
      console.warn('CSRF: Token expired');
      req.session.csrfToken = null;
      req.session.csrfTokenExpiry = null;
      return res.status(403).json({
        error: 'CSRF token expired, please refresh',
        code: 'CSRF_EXPIRED'
      });
    }

    // Use timing-safe comparison to prevent timing attacks
    const sessionTokenBuffer = Buffer.from(req.session.csrfToken, 'hex');
    const providedTokenBuffer = Buffer.from(providedToken, 'hex');

    // Check buffer lengths match
    if (sessionTokenBuffer.length !== providedTokenBuffer.length) {
      console.warn('CSRF: Token format mismatch');
      return res.status(403).json({
        error: 'Invalid CSRF token',
        code: 'CSRF_INVALID'
      });
    }

    // Timing-safe comparison
    let tokensMatch = false;
    try {
      tokensMatch = crypto.timingSafeEqual(
        sessionTokenBuffer,
        providedTokenBuffer
      );
    } catch (error) {
      console.warn('CSRF: Token comparison error:', error.message);
      return res.status(403).json({
        error: 'Invalid CSRF token',
        code: 'CSRF_INVALID'
      });
    }

    if (!tokensMatch) {
      console.warn('CSRF: Token mismatch - possible attack');
      return res.status(403).json({
        error: 'Invalid CSRF token',
        code: 'CSRF_MISMATCH'
      });
    }

    // Token is valid, attach to request for logging
    req.csrfValid = true;

    // Optional: Rotate token after use for extra security
    // req.session.csrfToken = generateCSRFToken();
    // req.session.csrfTokenExpiry = Date.now() + TOKEN_TTL_MS;

    next();
  } catch (error) {
    console.error('CSRF validation error:', error.message);
    return res.status(500).json({ error: 'CSRF validation error' });
  }
};

/**
 * Middleware: Clear CSRF token (on logout or sensitive operations)
 */
const clearToken = (req, res, next) => {
  if (req.session) {
    req.session.csrfToken = null;
    req.session.csrfTokenExpiry = null;
  }
  next();
};

/**
 * Middleware: Return CSRF token to client (often used with JSON responses)
 * Add to response headers for frontend to pick up
 */
const attachTokenToResponse = (req, res, next) => {
  if (req.csrfToken) {
    res.setHeader('X-CSRF-Token', req.csrfToken);
  }
  next();
};

/**
 * ============================================================
 * HELPER FUNCTIONS
 * ============================================================
 */

/**
 * Get CSRF token from session (for logging/debugging)
 * Never expose actual token to logs
 */
function getTokenInfo(req) {
  if (!req.session || !req.session.csrfToken) {
    return { hasToken: false };
  }

  return {
    hasToken: true,
    tokenLength: req.session.csrfToken.length,
    isExpired: req.session.csrfTokenExpiry && Date.now() > req.session.csrfTokenExpiry,
    expiresIn: req.session.csrfTokenExpiry 
      ? Math.round((req.session.csrfTokenExpiry - Date.now()) / 1000) 
      : null
  };
}

/**
 * Create audit log for CSRF events
 */
function createCSRFAuditLog(req, event, status) {
  return {
    timestamp: new Date().toISOString(),
    event,
    status, // 'success' | 'failed' | 'expired'
    ipAddress: req.ip || req.connection.remoteAddress,
    userId: req.authUser?.id || null,
    endpoint: req.originalUrl,
    method: req.method
  };
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Middleware
  generateToken,
  validateToken,
  clearToken,
  attachTokenToResponse,

  // Core functions
  generateCSRFToken,
  getTokenInfo,

  // Audit
  createCSRFAuditLog,

  // Constants
  TOKEN_LENGTH,
  TOKEN_TTL_MS
};
