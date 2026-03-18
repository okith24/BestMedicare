/**
 * ============================================================
 * COOKIE CONFIGURATION & MIDDLEWARE
 * ============================================================
 * 
 * Secure cookie handling for sessions
 * - HTTP-only (prevents XSS access)
 * - Secure (HTTPS only in production)
 * - SameSite (prevents CSRF)
 */

const cookieParser = require('cookie-parser');

/**
 * Get secure cookie options based on environment
 */
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = isProduction || process.env.HTTPS_ENABLED === 'true';

  return {
    // Core security options
    httpOnly: true, // Inaccessible to JavaScript (prevents XSS theft)
    secure: isSecure, // Only send over HTTPS
    sameSite: 'strict', // Prevent CSRF (only sent to same origin)

    // Domain binding
    domain: process.env.COOKIE_DOMAIN || undefined,

    // Session duration
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    path: '/',

    // Additional security
    signed: true // Sign with secret to prevent tampering
  };
}

/**
 * Get session cookie options (shorter duration)
 */
function getSessionCookieOptions() {
  const options = getCookieOptions();
  options.maxAge = 24 * 60 * 60 * 1000; // 24 hours
  return options;
}

/**
 * Get 2FA cookie options (very short duration)
 */
function get2FACookieOptions() {
  const options = getCookieOptions();
  options.maxAge = 5 * 60 * 1000; // 5 minutes
  return options;
}

/**
 * Middleware to initialize cookie parser
 */
function initializeCookies(app) {
  const cookieSecret = process.env.COOKIE_SECRET;

  if (!cookieSecret) {
    throw new Error(
      'COOKIE_SECRET not configured. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Parse cookies and sign with secret
  app.use(cookieParser(cookieSecret));

  // Middleware to validate cookie secret on every request
  app.use((req, res, next) => {
    // Cookie validation happens automatically via cookie-parser
    next();
  });
}

/**
 * Set a secure cookie
 */
function setSecureCookie(res, name, value, options = {}) {
  const defaultOptions = getCookieOptions();
  const finalOptions = { ...defaultOptions, ...options };

  res.cookie(name, value, finalOptions);
}

/**
 * Set a session cookie (shorter duration for auth token)
 */
function setSessionCookie(res, name, value) {
  res.cookie(name, value, getSessionCookieOptions());
}

/**
 * Set 2FA temporary cookie
 */
function set2FACookie(res, name, value) {
  res.cookie(name, value, get2FACookieOptions());
}

/**
 * Clear a cookie
 */
function clearCookie(res, name) {
  res.clearCookie(name, {
    domain: process.env.COOKIE_DOMAIN || undefined,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.HTTPS_ENABLED === 'true',
    sameSite: 'strict',
    path: '/'
  });
}

/**
 * Middleware to validate session cookie
 */
function validateSessionCookie(req, res, next) {
  const sessionToken = req.signedCookies.sessionToken;

  if (!sessionToken) {
    // No session cookie, but that's OK - might be using Authorization header
    return next();
  }

  // Verify session token is valid
  // This would typically check against database
  req.sessionToken = sessionToken;
  next();
}

/**
 * Middleware for 2FA verification
 * Checks if user has verified 2FA in this session
 */
function verify2FACookie(req, res, next) {
  // Safety check for cookies initialization
  if (!req.signedCookies) {
    req.twoFAVerified = false;
    return next();
  }

  const twoFAVerified = req.signedCookies.twoFAVerified;

  if (req.authUser && twoFAVerified) {
    // User has verified 2FA recently
    req.twoFAVerified = true;
  } else {
    req.twoFAVerified = false;
  }

  next();
}

/**
 * Force clear all auth cookies on logout
 */
function clearAuthCookies(res) {
  clearCookie(res, 'sessionToken');
  clearCookie(res, 'twoFAVerified');
  clearCookie(res, 'deviceFingerprint');
}

module.exports = {
  initializeCookies,
  getCookieOptions,
  getSessionCookieOptions,
  get2FACookieOptions,
  setSecureCookie,
  setSessionCookie,
  set2FACookie,
  clearCookie,
  clearAuthCookies,
  validateSessionCookie,
  verify2FACookie
};
