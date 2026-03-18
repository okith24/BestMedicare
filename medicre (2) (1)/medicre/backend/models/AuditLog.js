const mongoose = require('mongoose');

/**
 * ============================================================
 * AUDIT LOG MODEL - COMPLIANCE & SECURITY TRACKING
 * ============================================================
 * 
 * Tracks all sensitive operations for:
 * - HIPAA compliance (healthcare data access logs)
 * - PCI-DSS compliance (payment data access logs)
 * - Fraud investigation
 * - User behavior analysis
 * 
 * Cannot be deleted (immutable collection)
 */

const auditLogSchema = new mongoose.Schema(
  {
    // ============================================================
    // WHO (User Information)
    // ============================================================
    
    /**
     * User who performed the action (null for anonymous)
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
      index: true
    },

    /**
     * User role at time of action (snapshot for immutability)
     * May differ from current role if user was demoted
     */
    userRole: {
      type: String,
      enum: ['patient', 'staff', 'doctor', 'admin', 'superadmin', 'anonymous'],
      required: true,
      index: true
    },

    /**
     * Username/email at time of action
     */
    userIdentifier: {
      type: String,
      maxlength: 255,
      trim: true
    },

    // ============================================================
    // WHAT (Action Details)
    // ============================================================

    /**
     * Category of action
     * auth: login, logout, password change
     * payment: charge, refund, token creation
     * data: read, write, delete
     * admin: role change, config change
     */
    category: {
      type: String,
      enum: ['auth', 'payment', 'data', 'admin', 'access', 'error'],
      required: true,
      index: true
    },

    /**
     * Specific action taken
     */
    action: {
      type: String,
      required: true,
      maxlength: 100,
      index: true,
      examples: [
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'PASSWORD_CHANGED',
        'PAYMENT_PROCESSED',
        'PAYMENT_REFUNDED',
        'PATIENT_DATA_ACCESSED',
        'PATIENT_DATA_MODIFIED',
        'TOKEN_CREATED',
        'ADMIN_ROLE_GRANTED',
        'SECURITY_ALERT_TRIGGERED'
      ]
    },

    /**
     * Human-readable description
     */
    description: {
      type: String,
      maxlength: 500,
      trim: true
    },

    /**
     * Result of action (success/failure)
     */
    result: {
      type: String,
      enum: ['success', 'failure', 'partial'],
      default: 'success',
      index: true
    },

    /**
     * Error message if action failed
     */
    errorMessage: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    // ============================================================
    // RESOURCE (What was affected)
    // ============================================================

    /**
     * Type of resource affected
     */
    resourceType: {
      type: String,
      enum: [
        'User',
        'Patient',
        'Payment',
        'PaymentToken',
        'Invoice',
        'Appointment',
        'Session',
        'Config',
        'AdminAction'
      ],
      required: true,
      index: true
    },

    /**
     * ID of resource
     */
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      sparse: true,
      index: true
    },

    /**
     * All changes made (for audit trail)
     * Format: { fieldName: { before: value, after: value } }
     */
    changes: {
      type: mongoose.Schema.Types.Mixed,
      sparse: true
    },

    // ============================================================
    // SENSITIVE DATA LOGGING (PCI/HIPAA)
    // ============================================================

    /**
     * For payment actions: last 4 digits of card
     * Never store full card number
     */
    cardLast4: {
      type: String,
      sparse: true,
      match: /^\d{4}$/
    },

    /**
     * For payment actions: amount in cents
     */
    amount: {
      type: Number,
      sparse: true
    },

    /**
     * For payment actions: currency code
     */
    currency: {
      type: String,
      sparse: true,
      maxlength: 3
    },

    /**
     * For data access: was PII/PHI accessed?
     * Flagged for higher security review
     */
    containsSensitiveData: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * List of sensitive fields accessed
     * Examples: ['ssn', 'medicalHistory', 'phoneNumber']
     */
    sensitiveFields: [
      {
        type: String,
        maxlength: 100
      }
    ],

    // ============================================================
    // CONTEXT (How & Where)
    // ============================================================

    /**
     * IP address of requester
     */
    ipAddress: {
      type: String,
      maxlength: 45,
      required: true,
      index: true
    },

    /**
     * User agent (browser/app info)
     */
    userAgent: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    /**
     * Country/location of IP (if available)
     */
    location: {
      type: String,
      maxlength: 100,
      sparse: true
    },

    /**
     * API endpoint that was called
     */
    endpoint: {
      type: String,
      maxlength: 255,
      sparse: true
    },

    /**
     * HTTP method
     */
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      sparse: true
    },

    // ============================================================
    // SECURITY FLAGS
    // ============================================================

    /**
     * Was there a security concern with this action?
     */
    securityFlag: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * Why was this flagged?
     * Examples: 'unusual_time', 'new_ip', 'bulk_access', 'failed_verification'
     */
    flagReason: {
      type: String,
      maxlength: 100,
      sparse: true
    },

    /**
     * Severity of security concern
     */
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
      sparse: true
    },

    /**
     * Should this trigger an alert?
     */
    requiresReview: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'auditLogs'
  }
);

// ============================================================
// INDEXES FOR QUERY PERFORMANCE
// ============================================================

// Fast lookups by user and time
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Find all actions by a user on a resource
auditLogSchema.index({ userId: 1, resourceType: 1, createdAt: -1 });

// Find flagged actions
auditLogSchema.index({ securityFlag: 1, createdAt: -1 });

// Compliance audit trail (all changes to a resource)
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

// Find payment transaction audits
auditLogSchema.index({ category: 1, action: 1, createdAt: -1 });

// Alerts & reviews needed
auditLogSchema.index({ requiresReview: 1, severity: 1, createdAt: -1 });

// HIPAA/PCI compliance: sensitive data access
auditLogSchema.index({ containsSensitiveData: 1, createdAt: -1 });

// Time-based queries for compliance reports
auditLogSchema.index({ createdAt: -1 });

// ============================================================
// INSTANCE METHODS
// ============================================================

/**
 * Log a successful action
 */
auditLogSchema.statics.logSuccess = async function(data) {
  return this.create({
    ...data,
    result: 'success'
  });
};

/**
 * Log a failed action
 */
auditLogSchema.statics.logFailure = async function(data) {
  return this.create({
    ...data,
    result: 'failure',
    securityFlag: true
  });
};

/**
 * Log with security concern
 */
auditLogSchema.statics.logSecurityAlert = async function(data) {
  return this.create({
    ...data,
    securityFlag: true,
    requiresReview: true,
    severity: data.severity || 'high'
  });
};

/**
 * Get audit trail for a resource
 */
auditLogSchema.statics.getResourceAudit = async function(resourceType, resourceId, limit = 50) {
  return this.find({
    resourceType,
    resourceId
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get user's action history
 */
auditLogSchema.statics.getUserHistory = async function(userId, limit = 100) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Find suspicious activity
 */
auditLogSchema.statics.findSuspiciousActivity = async function(limit = 50) {
  return this.find({
    $or: [
      { securityFlag: true },
      { requiresReview: true },
      { result: 'failure' },
      { severity: { $in: ['high', 'critical'] } }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
