/**
 * ============================================================
 * PAYMENT SYSTEM CONSTANTS
 * ============================================================
 * 
 * Central location for all payment system constants
 * Used across all payment modules
 */

/**
 * ============================================================
 * TRANSACTION STATUS
 * ============================================================
 */
const TRANSACTION_STATUS = {
  PENDING: 'pending',           // Awaiting processing
  AUTHORIZED: 'authorized',     // Amount held, not yet captured
  CAPTURED: 'captured',         // Amount charged successfully
  SETTLED: 'settled',           // Funds transferred
  DECLINED: 'declined',         // Transaction rejected
  FAILED: 'failed',             // Processing error
  CANCELLED: 'cancelled',       // Cancelled by user/admin
  REFUNDED: 'refunded',         // Fully refunded
  PARTIALLY_REFUNDED: 'partially_refunded', // Partial refund
  EXPIRED: 'expired',           // Authorization expired
  PENDING_REVIEW: 'pending_review' // Fraud review
};

/**
 * ============================================================
 * PAYMENT METHODS
 * ============================================================
 */
const PAYMENT_METHOD = {
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  DIGITAL_WALLET: 'digital_wallet',
  CASH_ON_DELIVERY: 'cash_on_delivery'
};

/**
 * ============================================================
 * TRANSACTION TYPES
 * ============================================================
 */
const TRANSACTION_TYPE = {
  AUTHORIZATION: 'authorization',      // Hold amount (no capture)
  AUTHORIZATION_AND_CAPTURE: 'auth_and_capture', // Immediate charge
  CAPTURE: 'capture',                  // Capture previously authorized
  REFUND: 'refund',                    // Return funds to customer
  REVERSAL: 'reversal',                // Cancel pending authorization
  INQUIRY: 'inquiry'                   // Check transaction status
};

/**
 * ============================================================
 * CURRENCIES
 * ============================================================
 */
const CURRENCY = {
  USD: 'USD',  // US Dollar
  LKR: 'LKR',  // Sri Lankan Rupee
  EUR: 'EUR'   // Euro
};

/**
 * Currency decimal places
 */
const CURRENCY_DECIMAL_PLACES = {
  USD: 2,
  LKR: 2,
  EUR: 2
};

/**
 * ============================================================
 * CARD TYPES
 * ============================================================
 */
const CARD_BRAND = {
  VISA: 'Visa',
  MASTERCARD: 'MasterCard',
  AMEX: 'AmericanExpress',
  DISCOVER: 'Discover',
  DINERS: 'Diners',
  JCB: 'JCB'
};

/**
 * ============================================================
 * AVS (ADDRESS VERIFICATION SYSTEM) RESPONSES
 * ============================================================
 */
const AVS_RESULT = {
  MATCH: 'Y',           // Match - Address and 5-digit ZIP match
  ZIP_MATCH_ONLY: 'Z',  // Only ZIP matches
  NO_MATCH: 'N',        // No match - Address and ZIP don't match
  NA: 'U',              // Not available
  NOT_CHECKED: 'I',     // Address not checked
  NOT_VERIFIED: 'S',    // Service not available
  NOT_PROVIDED: 'P',    // Not provided by issuer
  RETRY: 'R',           // Retry - Issuer unavailable
  BAD_RESPONSE: 'E',    // Error in processing
  NOT_USED: 'X'         // Not applicable
};

/**
 * AVS decision: should we decline?
 */
const AVS_AUTO_DECLINE = ['N', 'I', 'B', 'C'];

/**
 * ============================================================
 * CVN (CARD VERIFICATION NUMBER) RESPONSES
 * ============================================================
 */
const CVN_RESULT = {
  MATCH: 'M',           // Match
  NO_MATCH: 'N',        // No match
  NOT_PROVIDED: 'P',    // Not provided
  NOT_CHECKED: 'S',     // Service unavailable
  INVALID_FORMAT: 'I',  // Invalid format
  ERROR: 'E'            // Error in processing
};

/**
 * CVN decision: should we decline?
 */
const CVN_AUTO_DECLINE = ['N', 'I'];

/**
 * ============================================================
 * DECISION MANAGER - RISK LEVELS
 * ============================================================
 */
const RISK_LEVEL = {
  LOW: 'low',       // 0-30 points
  MEDIUM: 'medium', // 31-70 points
  HIGH: 'high'      // 71-100 points
};

/**
 * Default risk thresholds
 */
const RISK_THRESHOLD = {
  AUTO_APPROVE: 30,
  MANUAL_REVIEW: 70,
  AUTO_DECLINE: 100
};

/**
 * ============================================================
 * 3D SECURE AUTHENTICATION
 * ============================================================
 */
const THREE_D_SECURE = {
  VERSION: {
    V1: '1.0.2',
    V2: '2.0.0'
  },
  STATUS: {
    SUCCESS: 'Y',        // Authenticated
    FAILED: 'N',         // Authentication failed
    UNAVAILABLE: 'U',    // Service unavailable
    ATTEMPTED: 'A'       // Attempted but not authenticated
  }
};

/**
 * ============================================================
 * REFUND STATUS
 * ============================================================
 */
const REFUND_STATUS = {
  PENDING: 'pending',
  PROCESSED: 'processed',
  FAILED: 'failed',
  REJECTED: 'rejected'
};

/**
 * ============================================================
 * TOKEN STATUS
 * ============================================================
 */
const TOKEN_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked'
};

/**
 * ============================================================
 * ERROR CODES
 * ============================================================
 */
const ERROR_CODE = {
  // Authentication & Security
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Validation
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_CURRENCY: 'INVALID_CURRENCY',
  INVALID_EMAIL: 'INVALID_EMAIL',
  PII_VIOLATION: 'PII_VIOLATION',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // Card/Token
  INVALID_CARD: 'INVALID_CARD',
  INVALID_TOKEN: 'INVALID_TOKEN',
  EXPIRED_CARD: 'EXPIRED_CARD',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  CARD_DECLINED: 'CARD_DECLINED',

  // Fraud
  FRAUD_DETECTED: 'FRAUD_DETECTED',
  AVS_FAILED: 'AVS_FAILED',
  CVN_FAILED: 'CVN_FAILED',
  RISK_THRESHOLD_EXCEEDED: 'RISK_THRESHOLD_EXCEEDED',

  // Processing
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  TRANSACTION_TIMEOUT: 'TRANSACTION_TIMEOUT',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',

  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  GATEWAY_ERROR: 'GATEWAY_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
};

/**
 * HTTP status code mappings
 */
const ERROR_HTTP_STATUS = {
  INVALID_SIGNATURE: 401,
  CSRF_TOKEN_INVALID: 403,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_AMOUNT: 400,
  INVALID_CURRENCY: 400,
  INVALID_EMAIL: 400,
  PII_VIOLATION: 400,
  INVALID_REQUEST: 400,
  INVALID_CARD: 400,
  INVALID_TOKEN: 400,
  EXPIRED_CARD: 400,
  EXPIRED_TOKEN: 400,
  CARD_DECLINED: 402,
  FRAUD_DETECTED: 402,
  AVS_FAILED: 402,
  CVN_FAILED: 402,
  RISK_THRESHOLD_EXCEEDED: 402,
  INSUFFICIENT_FUNDS: 402,
  TRANSACTION_TIMEOUT: 504,
  DUPLICATE_TRANSACTION: 409,
  TRANSACTION_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  GATEWAY_ERROR: 502,
  DATABASE_ERROR: 500
};

/**
 * ============================================================
 * API ENDPOINTS
 * ============================================================
 */
const CYBERSOURCE_ENDPOINT = {
  PAYMENTS: 'payments',
  TOKENS: 'payment_instruments',
  SEARCH: 'search/transactions',
  REFUND: 'refunds'
};

/**
 * ============================================================
 * VALIDATION LIMITS
 * ============================================================
 */
const VALIDATION_LIMITS = {
  MIN_AMOUNT: 1,
  MAX_AMOUNT: 999999999,
  EMAIL_MAX_LENGTH: 254,
  PHONE_MIN_LENGTH: 7,
  PHONE_MAX_LENGTH: 20,
  ADDRESS_MAX_LENGTH: 200,
  INVOICE_REF_MAX_LENGTH: 50,
  CVN_LENGTH: { min: 3, max: 4 },
  CARD_NUMBER_LENGTH: { min: 13, max: 19 }
};

/**
 * ============================================================
 * TIME LIMITS (in milliseconds)
 * ============================================================
 */
const TIME_LIMIT = {
  CSRF_TOKEN_TTL: 60 * 60 * 1000,        // 1 hour
  PAYMENT_TOKEN_TTL: 24 * 60 * 60 * 1000, // 24 hours
  SESSION_TTL: 14 * 24 * 60 * 60 * 1000, // 14 days
  OTP_TTL: 10 * 60 * 1000,               // 10 minutes
  API_TIMEOUT: 30 * 1000                 // 30 seconds
};

/**
 * ============================================================
 * AUDIT LOG EVENTS
 * ============================================================
 */
const AUDIT_EVENT = {
  // Payment events
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_AUTHORIZED: 'payment_authorized',
  PAYMENT_CAPTURED: 'payment_captured',
  PAYMENT_DECLINED: 'payment_declined',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',

  // Security events
  SIGNATURE_VERIFIED: 'signature_verified',
  SIGNATURE_INVALID: 'signature_invalid',
  CSRF_VALIDATED: 'csrf_validated',
  CSRF_INVALID: 'csrf_invalid',
  PII_BLOCKED: 'pii_blocked',

  // Token events
  TOKEN_CREATED: 'token_created',
  TOKEN_USED: 'token_used',
  TOKEN_REVOKED: 'token_revoked',
  TOKEN_EXPIRED: 'token_expired',

  // Fraud events
  FRAUD_CHECK_PASSED: 'fraud_check_passed',
  FRAUD_CHECK_FAILED: 'fraud_check_failed',
  AVS_CHECK_PASSED: 'avs_check_passed',
  AVS_CHECK_FAILED: 'avs_check_failed',
  CVN_CHECK_PASSED: 'cvn_check_passed',
  CVN_CHECK_FAILED: 'cvn_check_failed'
};

/**
 * ============================================================
 * SEVERITY LEVELS
 * ============================================================
 */
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Status constants
  TRANSACTION_STATUS,
  PAYMENT_METHOD,
  TRANSACTION_TYPE,
  CURRENCY,
  CURRENCY_DECIMAL_PLACES,
  CARD_BRAND,

  // Verification results
  AVS_RESULT,
  AVS_AUTO_DECLINE,
  CVN_RESULT,
  CVN_AUTO_DECLINE,

  // Risk & Decision Manager
  RISK_LEVEL,
  RISK_THRESHOLD,
  THREE_D_SECURE,

  // Other status types
  REFUND_STATUS,
  TOKEN_STATUS,

  // Errors
  ERROR_CODE,
  ERROR_HTTP_STATUS,

  // API
  CYBERSOURCE_ENDPOINT,

  // Validation
  VALIDATION_LIMITS,
  TIME_LIMIT,

  // Audit & logging
  AUDIT_EVENT,
  SEVERITY
};
