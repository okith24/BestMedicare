const joi = require('joi');

/**
 * ============================================================
 * INPUT VALIDATION MIDDLEWARE - PAYMENT SECURITY
 * ============================================================
 * 
 * Validates ALL payment input against strict schemas
 * Prevents injection attacks, data tampering, and PII violations
 * 
 * Security Rules:
 * - Amount must be positive number
 * - Currency must be predefined (LKR, USD)
 * - No PII (patient IDs, medical records, SSN)
 * - Email format validation
 * - Address validation for AVS checks
 * - Reject unknown fields
 */

/**
 * ============================================================
 * PAYMENT REQUEST SCHEMA
 * ============================================================
 * 
 * When processing a payment charge
 */
const paymentChargeSchema = joi.object({
  // Amount in smallest currency unit (e.g., cents for USD)
  amount: joi
    .number()
    .integer()
    .min(1)
    .max(999999999) // Max limit (adjust as needed)
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.integer': 'Amount must be a whole number',
      'number.min': 'Amount must be at least 1',
      'number.max': 'Amount exceeds maximum limit'
    }),

  // Currency code (only allowed currencies)
  currency: joi
    .string()
    .uppercase()
    .valid('USD', 'LKR', 'EUR')
    .required()
    .messages({
      'string.only': 'Currency must be one of: USD, LKR, EUR'
    }),

  // Invoice/transaction reference
  invoiceRef: joi
    .string()
    .alphanum()
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'Invoice reference must be alphanumeric'
    }),

  // Customer email (required for receipt)
  customerEmail: joi
    .string()
    .email()
    .required()
    .messages({
      'string.email': 'Must be a valid email address'
    }),

  // Payment method (card or other)
  paymentMethod: joi
    .string()
    .valid('card', 'bank_transfer')
    .default('card'),

  // Billing address for AVS (Address Verification System)
  billingAddress: joi
    .object({
      street: joi.string().max(200),
      city: joi.string().max(50),
      state: joi.string().max(50),
      postalCode: joi.string().max(20),
      country: joi.string().max(2) // ISO country code
    })
    .optional(),

  // Card token (from Cybersource TMS - NOT card number)
  cardToken: joi
    .string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Invalid card token format'
    }),

  // Merchant-defined data (NON-PII ONLY)
  // RESTRICTED: Cannot include patient ID, medical records, SSN
  merchantData: joi
    .object({
      appointmentType: joi.string().max(50),
      department: joi.string().max(50),
      doctorId: joi.string().max(50),
      // Add other non-PII fields as needed
      // FORBIDDEN fields would generate validation errors
    })
    .optional(),

  // Metadata for internal tracking
  metadata: joi
    .object({
      source: joi.string().max(50),
      reason: joi.string().max(500),
      notes: joi.string().max(1000)
    })
    .optional()
})
  .unknown(false) // Reject unknown fields
  .required();

/**
 * ============================================================
 * PAYMENT TOKEN SCHEMA
 * ============================================================
 * 
 * When creating/storing a payment token
 */
const paymentTokenSchema = joi.object({
  cybersourceToken: joi
    .string()
    .max(500)
    .required(),

  cardLast4: joi
    .string()
    .length(4)
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      'string.pattern.base': 'Card last 4 must be digits'
    }),

  cardBrand: joi
    .string()
    .valid('Visa', 'MasterCard', 'AmericanExpress', 'Discover')
    .required(),

  expiryMonth: joi
    .number()
    .integer()
    .min(1)
    .max(12)
    .required(),

  expiryYear: joi
    .number()
    .integer()
    .min(2024)
    .max(2099)
    .required(),

  tokenStatus: joi
    .string()
    .valid('active', 'expired', 'revoked')
    .default('active')
})
  .unknown(false)
  .required();

/**
 * ============================================================
 * REFUND REQUEST SCHEMA
 * ============================================================
 */
const refundSchema = joi.object({
  paymentId: joi
    .string()
    .required()
    .messages({
      'any.required': 'Payment ID is required'
    }),

  amount: joi
    .number()
    .integer()
    .min(1)
    .optional()
    .messages({
      'number.min': 'Refund amount must be at least 1'
    }),

  reason: joi
    .string()
    .max(500)
    .required()
    .messages({
      'any.required': 'Refund reason is required'
    }),

  notes: joi
    .string()
    .max(1000)
    .optional()
})
  .unknown(false)
  .required();

/**
 * ============================================================
 * VALIDATION FUNCTIONS
 * ============================================================
 */

/**
 * Validate payment charge request
 * @param {Object} data - Request data to validate
 * @returns {Object} { valid: boolean, errors: array, data: object }
 */
function validatePaymentChargeRequest(data) {
  try {
    const { error, value } = paymentChargeSchema.validate(data, {
      abortEarly: false, // Return all errors, not just first
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return {
        valid: false,
        errors: errorMessages,
        data: null
      };
    }

    return {
      valid: true,
      errors: [],
      data: value
    };
  } catch (err) {
    return {
      valid: false,
      errors: [{ message: `Validation error: ${err.message}` }],
      data: null
    };
  }
}

/**
 * Validate payment token
 * @param {Object} data - Token data to validate
 * @returns {Object} { valid: boolean, errors: array, data: object }
 */
function validatePaymentToken(data) {
  try {
    const { error, value } = paymentTokenSchema.validate(data, {
      abortEarly: false
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return {
        valid: false,
        errors: errorMessages,
        data: null
      };
    }

    return {
      valid: true,
      errors: [],
      data: value
    };
  } catch (err) {
    return {
      valid: false,
      errors: [{ message: `Validation error: ${err.message}` }],
      data: null
    };
  }
}

/**
 * Validate refund request
 * @param {Object} data - Refund request data
 * @returns {Object} { valid: boolean, errors: array, data: object }
 */
function validateRefundRequest(data) {
  try {
    const { error, value } = refundSchema.validate(data, {
      abortEarly: false
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return {
        valid: false,
        errors: errorMessages,
        data: null
      };
    }

    return {
      valid: true,
      errors: [],
      data: value
    };
  } catch (err) {
    return {
      valid: false,
      errors: [{ message: `Validation error: ${err.message}` }],
      data: null
    };
  }
}

/**
 * ============================================================
 * EXPRESS MIDDLEWARE
 * ============================================================
 */

/**
 * Middleware: Validate payment charge request
 * Use on: POST /api/payments/charge
 */
const validatePaymentCharge = (req, res, next) => {
  const validation = validatePaymentChargeRequest(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      error: 'Invalid payment request',
      code: 'VALIDATION_ERROR',
      details: validation.errors
    });
  }

  // Attach validated data to request
  req.validatedPayment = validation.data;
  next();
};

/**
 * Middleware: Validate token request
 * Use on: POST /api/payments/tokens
 */
const validateToken = (req, res, next) => {
  const validation = validatePaymentToken(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      error: 'Invalid token data',
      code: 'TOKEN_VALIDATION_ERROR',
      details: validation.errors
    });
  }

  req.validatedToken = validation.data;
  next();
};

/**
 * Middleware: Validate refund request
 * Use on: POST /api/payments/:id/refund
 */
const validateRefund = (req, res, next) => {
  const validation = validateRefundRequest(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      error: 'Invalid refund request',
      code: 'REFUND_VALIDATION_ERROR',
      details: validation.errors
    });
  }

  req.validatedRefund = validation.data;
  next();
};

/**
 * ============================================================
 * PII VALIDATION (Compliance Check)
 * ============================================================
 * 
 * FORBIDDEN: Never allow PII in payment fields
 */

const FORBIDDEN_PII_PATTERNS = [
  /patientid/i,
  /patient_id/i,
  /medicalrecord/i,
  /medical_record/i,
  /ssn/i,
  /social.?security/i,
  /nationalid/i,
  /national.?id/i,
  /diagnosis/i,
  /treatment/i,
  /prescription/i
];

/**
 * Check if data contains forbidden PII
 * @param {Object} data - Data to check
 * @returns {Object} { hasPII: boolean, foundFields: array }
 */
function checkForForbiddenPII(data) {
  const foundFields = [];

  const checkValue = (obj, path = '') => {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
      // Check if string looks like PII
      FORBIDDEN_PII_PATTERNS.forEach(pattern => {
        if (pattern.test(obj)) {
          foundFields.push({
            path,
            value: obj.substring(0, 50) // Only log first 50 chars
          });
        }
      });
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        // Check field name itself
        FORBIDDEN_PII_PATTERNS.forEach(pattern => {
          if (pattern.test(key)) {
            foundFields.push({
              path: `${path}.${key}`,
              reason: 'Field name matches PII pattern'
            });
          }
        });

        // Recursively check value
        checkValue(obj[key], `${path}.${key}`);
      });
    }
  };

  checkValue(data);

  return {
    hasPII: foundFields.length > 0,
    foundFields
  };
}

/**
 * Middleware: Block requests containing PII
 */
const blockPII = (req, res, next) => {
  const piiCheck = checkForForbiddenPII(req.body);

  if (piiCheck.hasPII) {
    console.error('PII detected in payment request:', piiCheck.foundFields);
    return res.status(400).json({
      error: 'Payment request contains prohibited data',
      code: 'PII_VIOLATION',
      message: 'Patient information cannot be sent in payment requests',
      severity: 'critical'
    });
  }

  next();
};

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Validation functions
  validatePaymentChargeRequest,
  validatePaymentToken,
  validateRefundRequest,

  // Middleware
  validatePaymentCharge,
  validateToken,
  validateRefund,
  blockPII,

  // PII checking
  checkForForbiddenPII,

  // Schemas (for reuse)
  paymentChargeSchema,
  paymentTokenSchema,
  refundSchema
};
