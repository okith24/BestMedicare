const crypto = require('crypto');

/**
 * ============================================================
 * PAYMENT SECURITY MODULE - HMAC-SHA256 SIGNING & VERIFICATION
 * ============================================================
 * 
 * Prevents payment data tampering during transmission
 * All requests to Cybersource must be digitally signed
 * All responses from Cybersource must be verified
 */

// Constants
const ALGORITHM = 'sha256';
const ENCODING = 'hex';

/**
 * ============================================================
 * REQUEST SIGNING - Sign payment data before sending to Cybersource
 * ============================================================
 */

/**
 * Sign payment request fields using HMAC-SHA256
 * @param {Object} fields - Payment fields to sign
 * @param {String} secretKey - Cybersource secret key (32-byte hex)
 * @returns {String} HMAC signature (hex format)
 */
function signPaymentRequest(fields, secretKey) {
  try {
    if (!fields || typeof fields !== 'object') {
      throw new Error('Fields must be an object');
    }

    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error('Secret key must be provided');
    }

    // Sort fields alphabetically for consistent signing
    const sortedFields = Object.keys(fields)
      .sort()
      .reduce((obj, key) => {
        const value = fields[key];
        // Convert to string for HMAC
        obj[key] = value !== null && value !== undefined ? String(value) : '';
        return obj;
      }, {});

    // Create HMAC-SHA256
    const hmac = crypto.createHmac(ALGORITHM, secretKey);
    const fieldString = JSON.stringify(sortedFields);
    hmac.update(fieldString);

    return hmac.digest(ENCODING);
  } catch (error) {
    throw new Error(`Failed to sign payment request: ${error.message}`);
  }
}

/**
 * Create signed payment request with signature header
 * @param {Object} requestData - Payment request data
 * @param {String} secretKey - Cybersource secret key
 * @returns {Object} Request with signature header
 */
function createSignedRequest(requestData, secretKey) {
  if (!requestData) {
    throw new Error('Request data is required');
  }

  const signature = signPaymentRequest(requestData, secretKey);

  return {
    ...requestData,
    signature,
    signedAt: new Date().toISOString()
  };
}

/**
 * ============================================================
 * RESPONSE VERIFICATION - Verify payment response from Cybersource
 * ============================================================
 */

/**
 * Verify response signature from Cybersource
 * Prevents man-in-the-middle attacks
 * @param {Object} responseData - Response from Cybersource (minus signature)
 * @param {String} providedSignature - Signature provided by Cybersource
 * @param {String} secretKey - Cybersource secret key
 * @returns {Boolean} True if signature is valid
 */
function verifyPaymentResponse(responseData, providedSignature, secretKey) {
  try {
    if (!responseData || typeof responseData !== 'object') {
      throw new Error('Response data must be an object');
    }

    if (!providedSignature || typeof providedSignature !== 'string') {
      throw new Error('Provided signature must be a string');
    }

    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error('Secret key must be provided');
    }

    // Calculate expected signature
    const expectedSignature = signPaymentRequest(responseData, secretKey);

    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedSignature, ENCODING);
    const expectedBuffer = Buffer.from(expectedSignature, ENCODING);

    // Check lengths first (prevents timing leak on length)
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    // Timing-safe comparison
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    console.error(`Signature verification error: ${error.message}`);
    return false;
  }
}

/**
 * ============================================================
 * SECRET KEY MANAGEMENT
 * ============================================================
 */

/**
 * Generate a new secure secret key
 * Should be used only during setup
 * @param {Number} bytes - Number of random bytes (default: 32)
 * @returns {String} Random secret key in hex format
 */
function generateSecureKey(bytes = 32) {
  return crypto.randomBytes(bytes).toString(ENCODING);
}

/**
 * Validate secret key format
 * @param {String} secretKey - Secret key to validate
 * @returns {Boolean} True if valid format
 */
function isValidSecretKey(secretKey) {
  if (!secretKey || typeof secretKey !== 'string') {
    return false;
  }

  // Should be 32-byte hex (64 characters)
  if (secretKey.length !== 64) {
    return false;
  }

  // Should only contain hex characters
  return /^[a-f0-9]{64}$/i.test(secretKey);
}

/**
 * ============================================================
 * FIELD SIGNING RULES
 * ============================================================
 */

/**
 * Fields that MUST be signed on every request
 * These cannot be modified without breaking the signature
 */
const REQUIRED_SIGNED_FIELDS = [
  'amount',
  'currency',
  'merchantId',
  'invoiceRef',
  'transactionType',
  'customerEmail'
];

/**
 * Fields that MUST NOT be signed (customer input)
 * Card numbers, CVV, etc. are handled by Cybersource
 */
const FIELDS_NOT_SIGNED = [
  'cardNumber',
  'cvn',
  'expiryMonth',
  'expiryYear',
  'cardholderName',
  'password'
];

/**
 * Filter fields to sign (exclude sensitive customer input)
 * @param {Object} requestData - Full request data
 * @returns {Object} Fields to be signed
 */
function getFieldsToSign(requestData) {
  const fieldsToSign = {};

  Object.keys(requestData).forEach(key => {
    // Skip signature and metadata fields
    if (key === 'signature' || key === 'signedAt') {
      return;
    }

    // Skip explicitly excluded fields
    if (FIELDS_NOT_SIGNED.includes(key)) {
      return;
    }

    // Include all other fields
    fieldsToSign[key] = requestData[key];
  });

  return fieldsToSign;
}

/**
 * ============================================================
 * LOGGING & AUDIT (For compliance)
 * ============================================================
 */

/**
 * Create audit log for signature validation
 * Never log the actual signature or secret key
 * @param {Object} auditData - Data to log
 */
function createSecurityAuditLog(auditData) {
  return {
    timestamp: new Date().toISOString(),
    event: auditData.event || 'payment_security_event',
    status: auditData.status || 'unknown',
    transactionId: auditData.transactionId || null,
    ipAddress: auditData.ipAddress || null,
    details: {
      fieldCount: auditData.fieldCount || 0,
      signatureValid: auditData.signatureValid || false,
      errorMessage: auditData.errorMessage || null
    },
    severity: auditData.severity || 'info' // info, warning, error
  };
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Request signing
  signPaymentRequest,
  createSignedRequest,

  // Response verification
  verifyPaymentResponse,

  // Key management
  generateSecureKey,
  isValidSecretKey,

  // Field rules
  getFieldsToSign,
  REQUIRED_SIGNED_FIELDS,
  FIELDS_NOT_SIGNED,

  // Audit
  createSecurityAuditLog
};
