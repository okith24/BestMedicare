/**
 * ============================================================
 * CYBERSOURCE PAYMENT GATEWAY CONFIGURATION
 * ============================================================
 * 
 * Initializes Cybersource API client
 * Manages API credentials securely
 * Provides methods for API calls
 */

const https = require('https');

/**
 * ============================================================
 * ENVIRONMENT VALIDATION
 * ============================================================
 */

/**
 * Validate that all required environment variables are set
 * @throws {Error} If required variables are missing
 */
function validateEnvironment() {
  const requiredVars = [
    'CYBERSOURCE_API_KEY',
    'CYBERSOURCE_SECRET_KEY',
    'CYBERSOURCE_MERCHANT_ID',
    'CYBERSOURCE_ENVIRONMENT'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate secret key format
  const secretKey = process.env.CYBERSOURCE_SECRET_KEY;
  if (!/^[a-f0-9]{64}$/i.test(secretKey)) {
    console.warn('Warning: Secret key does not appear to be 32-byte hex');
  }

  // Validate environment
  const env = process.env.CYBERSOURCE_ENVIRONMENT;
  if (!['sandbox', 'production'].includes(env)) {
    throw new Error('CYBERSOURCE_ENVIRONMENT must be "sandbox" or "production"');
  }

  return true;
}

/**
 * ============================================================
 * CYBERSOURCE CONFIGURATION
 * ============================================================
 */

const config = {
  // API Credentials
  apiKey: process.env.CYBERSOURCE_API_KEY,
  secretKey: process.env.CYBERSOURCE_SECRET_KEY,
  merchantId: process.env.CYBERSOURCE_MERCHANT_ID,

  // Environment
  environment: process.env.CYBERSOURCE_ENVIRONMENT || 'sandbox',

  // API Endpoints
  apiHost: {
    sandbox: 'apitest.cybersource.com',
    production: 'api.cybersource.com'
  },

  // API Configuration
  apiVersion: 'v2.0',
  timeout: 30000, // 30 seconds
  
  // Security
  enableSignatureValidation: true,
  tlsVersion: '1.2',

  // Features
  decisionManager: {
    enabled: process.env.DECISION_MANAGER_ENABLED === 'true',
    riskThreshold: parseInt(process.env.FRAUD_RISK_THRESHOLD || '70')
  },

  // Tokenization (TMS)
  tokenization: {
    enabled: true,
    ttlHours: parseInt(process.env.PAYMENT_TOKEN_TTL_HOURS || '24')
  },

  // 3D Secure
  threeDSecure: {
    enabled: true,
    version: '2.0'
  },

  // Webhook
  webhook: {
    url: process.env.CYBERSOURCE_WEBHOOK_URL,
    secret: process.env.CYBERSOURCE_WEBHOOK_SECRET,
    enabled: !!process.env.CYBERSOURCE_WEBHOOK_URL
  },

  // Logging
  logging: {
    enabled: process.env.PAYMENT_AUDIT_LOG === 'true',
    level: process.env.PAYMENT_LOG_LEVEL || 'info'
  }
};

/**
 * ============================================================
 * API PATH BUILDERS
 * ============================================================
 */

/**
 * Get Cybersource API host for current environment
 */
function getApiHost() {
  const env = config.environment;
  const host = config.apiHost[env];
  
  if (!host) {
    throw new Error(`Unknown environment: ${env}`);
  }

  return host;
}

/**
 * Build API endpoint URL
 * @param {String} endpoint - API endpoint (e.g., 'payments')
 * @returns {String} Full API URL
 */
function buildApiUrl(endpoint) {
  const host = getApiHost();
  const version = config.apiVersion;
  return `https://${host}/${version}/${endpoint}`;
}

/**
 * ============================================================
 * REQUEST BUILDING
 * ============================================================
 */

/**
 * Build Cybersource API request options
 * @param {String} method - HTTP method (GET, POST, etc)
 * @param {String} endpoint - API endpoint
 * @param {Object} headers - Additional headers
 * @returns {Object} Request options for https module
 */
function buildRequestOptions(method, endpoint, headers = {}) {
  const host = getApiHost();
  const path = `/${config.apiVersion}/${endpoint}`;

  return {
    host,
    port: 443,
    path,
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'User-Agent': 'HospitalPaymentGateway/1.0',
      ...headers
    },
    timeout: config.timeout
  };
}

/**
 * ============================================================
 * ERROR HANDLING
 * ============================================================
 */

/**
 * Cybersource error codes
 */
const ERROR_CODES = {
  // Authentication errors
  '401': 'Unauthorized - Check API credentials',
  '403': 'Forbidden - Check merchant permissions',

  // Validation errors
  '400': 'Bad Request - Invalid payment data',
  '422': 'Unprocessable Entity - Payment data rejected',

  // Processing errors
  '500': 'Server Error - Cybersource service error',
  '502': 'Bad Gateway - Cybersource unavailable',
  '503': 'Service Unavailable - Cybersource maintenance',
  '504': 'Gateway Timeout - Request expired',

  // Business logic errors
  'INVALID_AMOUNT': 'Amount is invalid or exceeds limit',
  'INVALID_CURRENCY': 'Currency not supported',
  'CARD_DECLINED': 'Card was declined',
  'EXPIRED_CARD': 'Card has expired',
  'INVALID_TOKEN': 'Payment token is invalid or expired',
  'INSUFFICIENT_FUNDS': 'Insufficient funds',
  'FRAUD_DETECTED': 'Transaction flagged as fraudulent',
  'AVS_MISMATCH': 'Address verification failed',
  'CVN_MISMATCH': 'Security code verification failed'
};

/**
 * Parse Cybersource error response
 * @param {Object} response - Error response from API
 * @returns {Object} Parsed error information
 */
function parseError(response) {
  const statusCode = response.httpStatus || response.status || 500;
  const body = response.body || {};

  return {
    code: body.errorInformation?.reason || `HTTP_${statusCode}`,
    message: ERROR_CODES[statusCode] || ERROR_CODES[body.errorInformation?.reason] || 'Unknown error',
    details: body.errorInformation?.message || body.message || null,
    statusCode,
    transactionId: body.id || null,
    timestamp: new Date().toISOString()
  };
}

/**
 * ============================================================
 * API CLIENT
 * ============================================================
 */

/**
 * Make a request to Cybersource API
 * @param {String} method - HTTP method
 * @param {String} endpoint - API endpoint
 * @param {Object} body - Request body
 * @param {Object} headers - Additional headers
 * @returns {Promise<Object>} API response
 */
function makeRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = buildRequestOptions(method, endpoint, headers);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const responseBody = data ? JSON.parse(data) : {};
          
          // Store HTTP status in response
          responseBody.httpStatus = res.statusCode;

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            const error = parseError(responseBody);
            reject(error);
          }
        } catch (error) {
          reject({
            code: 'PARSE_ERROR',
            message: 'Failed to parse API response',
            details: error.message,
            statusCode: res.statusCode
          });
        }
      });
    });

    req.on('error', (error) => {
      reject({
        code: 'REQUEST_ERROR',
        message: 'Failed to connect to Cybersource',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({
        code: 'TIMEOUT',
        message: 'Request to Cybersource timed out',
        timeout: config.timeout
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * ============================================================
 * INITIALIZATION
 * ============================================================
 */

let initialized = false;

/**
 * Initialize Cybersource configuration
 * Should be called once at application startup
 */
function initialize() {
  if (initialized) {
    console.log('Cybersource already initialized');
    return;
  }

  try {
    validateEnvironment();
    initialized = true;

    console.log(`✓ Cybersource configured for ${config.environment} environment`);
    console.log(`✓ Merchant ID: ${config.merchantId}`);
    console.log(`✓ API Host: ${getApiHost()}`);
    console.log(`✓ Decision Manager: ${config.decisionManager.enabled ? 'enabled' : 'disabled'}`);
    console.log(`✓ 3D Secure: ${config.threeDSecure.enabled ? 'enabled' : 'disabled'}`);
    console.log(`✓ Webhook: ${config.webhook.enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    console.error('Failed to initialize Cybersource:', error.message);
    throw error;
  }
}

/**
 * Check if configuration is initialized
 */
function isInitialized() {
  return initialized;
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Configuration
  config,
  getApiHost,
  buildApiUrl,
  buildRequestOptions,

  // API methods
  makeRequest,

  // Error handling
  parseError,
  ERROR_CODES,

  // Initialization
  initialize,
  isInitialized,
  validateEnvironment
};
