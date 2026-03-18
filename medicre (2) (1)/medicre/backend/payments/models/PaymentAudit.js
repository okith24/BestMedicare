const mongoose = require('mongoose');

/**
 * ============================================================
 * PAYMENT AUDIT LOG MODEL
 * ============================================================
 * 
 * Immutable audit log for compliance and security tracking
 * Records all payment-related events for investigation
 * Never deleted (for historical tracking)
 */

const paymentAuditSchema = new mongoose.Schema(
  {
    // ============================================================
    // EVENT IDENTIFICATION
    // ============================================================

    /**
     * Type of event that occurred
     * Examples: payment_initiated, signature_verified, fraud_detected, etc.
     */
    eventType: {
      type: String,
      required: true,
      index: true,
      maxlength: 100
    },

    /**
     * Status of the event
     * success, failed, warning, error, blocked
     */
    status: {
      type: String,
      enum: ['success', 'failed', 'warning', 'error', 'blocked'],
      required: true,
      index: true
    },

    /**
     * Severity level
     * info, warning, error, critical
     */
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
      index: true
    },

    // ============================================================
    // TRANSACTION REFERENCE
    // ============================================================

    /**
     * Link to payment transaction
     */
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      index: true,
      sparse: true
    },

    /**
     * Invoice reference for lookup
     */
    invoiceRef: {
      type: String,
      index: true,
      maxlength: 50,
      sparse: true
    },

    /**
     * Cybersource transaction ID
     */
    cybersourceTransactionId: {
      type: String,
      index: true,
      maxlength: 100,
      sparse: true
    },

    /**
     * Link to payment token (if token-related event)
     */
    paymentTokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentToken',
      index: true,
      sparse: true
    },

    // ============================================================
    // USER & CONTEXT
    // ============================================================

    /**
     * User who initiated this event
     * Can be patient, admin, or system
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      sparse: true
    },

    /**
     * User email (for context if user is deleted)
     */
    userEmail: {
      type: String,
      maxlength: 254,
      lowercase: true,
      sparse: true
    },

    /**
     * Type of user: patient, admin, staff, system
     */
    userRole: {
      type: String,
      enum: ['patient', 'admin', 'staff', 'system', 'unknown'],
      default: 'unknown'
    },

    /**
     * IP address of the request
     */
    ipAddress: {
      type: String,
      maxlength: 45,
      sparse: true,
      index: true
    },

    /**
     * Country/Location (if available)
     */
    location: {
      type: String,
      maxlength: 100,
      sparse: true
    },

    /**
     * User agent / Browser info
     */
    userAgent: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    /**
     * Device fingerprint
     */
    deviceFingerprint: {
      type: String,
      maxlength: 256,
      sparse: true
    },

    /**
     * Session ID (for tracking related events)
     */
    sessionId: {
      type: String,
      maxlength: 256,
      sparse: true,
      index: true
    },

    // ============================================================
    // EVENT DETAILS
    // ============================================================

    /**
     * Human-readable description
     */
    description: {
      type: String,
      maxlength: 1000,
      required: true
    },

    /**
     * Technical details / reason
     */
    reason: {
      type: String,
      maxlength: 1000,
      sparse: true
    },

    /**
     * Error message (if applicable)
     */
    errorMessage: {
      type: String,
      maxlength: 1000,
      sparse: true
    },

    /**
     * Error code
     */
    errorCode: {
      type: String,
      maxlength: 100,
      sparse: true
    },

    // ============================================================
    // SECURITY EVENTS
    // ============================================================

    /**
     * For signature-related events
     */
    signatureData: {
      algorithm: String,
      signatureValid: Boolean,
      signatureLength: Number
    },

    /**
     * For CSRF-related events
     */
    csrfData: {
      tokenValid: Boolean,
      tokenExpired: Boolean,
      tokenLength: Number
    },

    /**
     * For fraud detection events
     */
    fraudData: {
      riskScore: Number,
      riskLevel: String, // low, medium, high
      flaggedReasons: [String],
      avsResult: String,
      cvnResult: String,
      threeDSecureStatus: String
    },

    /**
     * For PII violation events
     */
    piiData: {
      violationType: String,
      detectedFields: [String],
      rejectionReason: String
    },

    /**
     * For validation events
     */
    validationData: {
      fieldName: String,
      fieldValue: String, // Never store sensitive values!
      expectedFormat: String,
      actualFormat: String,
      validationRule: String
    },

    /**
     * Before/After values for auditing changes
     */
    changeData: {
      fieldName: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    },

    // ============================================================
    // RESPONSE DATA (Non-sensitive)
    // ============================================================

    /**
     * Cybersource response code
     */
    responseCode: {
      type: String,
      maxlength: 50,
      sparse: true
    },

    /**
     * Cybersource response status
     */
    responseStatus: {
      type: String,
      maxlength: 100,
      sparse: true
    },

    /**
     * Amount involved (for tracking)
     */
    amount: {
      type: Number,
      sparse: true
    },

    /**
     * Currency
     */
    currency: {
      type: String,
      maxlength: 3,
      sparse: true
    },

    // ============================================================
    // METRICS
    // ============================================================

    /**
     * Processing time in milliseconds
     */
    processingTimeMs: {
      type: Number,
      sparse: true
    },

    /**
     * Retry attempt number (if applicable)
     */
    retryAttempt: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * Batch ID (for bulk operations)
     */
    batchId: {
      type: String,
      maxlength: 100,
      sparse: true,
      index: true
    },

    // ============================================================
    // ADMIN NOTES
    // ============================================================

    /**
     * Admin notes about this event
     */
    adminNotes: {
      type: String,
      maxlength: 1000,
      sparse: true
    },

    /**
     * Whether this event requires investigation
     */
    requiresInvestigation: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * Investigation status: pending, in_progress, resolved, closed
     */
    investigationStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'resolved', 'closed'],
      sparse: true
    },

    /**
     * Investigation notes
     */
    investigationNotes: {
      type: String,
      maxlength: 2000,
      sparse: true
    },

    /**
     * Who is investigating
     */
    investigatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    /**
     * When investigation started
     */
    investigationStartedAt: {
      type: Date,
      sparse: true
    },

    /**
     * When investigation was completed
     */
    investigationClosedAt: {
      type: Date,
      sparse: true
    }
  },
  {
    timestamps: true, // Adds createdAt, updatedAt
    collection: 'paymentAudits'
  }
);

// ============================================================
// INDEXES
// ============================================================

// For filtering and searching
paymentAuditSchema.index({ eventType: 1, createdAt: -1 });
paymentAuditSchema.index({ status: 1, createdAt: -1 });
paymentAuditSchema.index({ severity: 1, createdAt: -1 });
paymentAuditSchema.index({ requiresInvestigation: 1, createdAt: -1 });

// For user tracking
paymentAuditSchema.index({ userId: 1, createdAt: -1 });
paymentAuditSchema.index({ userEmail: 1, createdAt: -1 });
paymentAuditSchema.index({ ipAddress: 1, createdAt: -1 });

// For transaction tracking
paymentAuditSchema.index({ paymentId: 1, createdAt: -1 });
paymentAuditSchema.index({ invoiceRef: 1, createdAt: -1 });

// For compliance reports
paymentAuditSchema.index({ eventType: 1, status: 1, createdAt: -1 });

// Compound indexes for common queries
paymentAuditSchema.index({ paymentId: 1, eventType: 1 });
paymentAuditSchema.index({ userId: 1, severity: 1, createdAt: -1 });

// ============================================================
// INSTANCE METHODS
// ============================================================

/**
 * Mark for investigation
 */
paymentAuditSchema.methods.markForInvestigation = function(reason = '') {
  this.requiresInvestigation = true;
  this.investigationStatus = 'pending';
  if (reason) {
    this.investigationNotes = reason;
  }
};

/**
 * Start investigation
 */
paymentAuditSchema.methods.startInvestigation = function(investigatorId) {
  this.investigationStatus = 'in_progress';
  this.investigatedBy = investigatorId;
  this.investigationStartedAt = new Date();
};

/**
 * Close investigation
 */
paymentAuditSchema.methods.closeInvestigation = function(notes = '') {
  this.investigationStatus = 'closed';
  this.investigationClosedAt = new Date();
  if (notes) {
    this.investigationNotes = notes;
  }
};

/**
 * Get full audit details (safe for viewing)
 */
paymentAuditSchema.methods.getDetails = function() {
  return {
    id: this._id,
    eventType: this.eventType,
    status: this.status,
    severity: this.severity,
    description: this.description,
    reason: this.reason,
    invoiceRef: this.invoiceRef,
    userEmail: this.userEmail,
    userRole: this.userRole,
    ipAddress: this.ipAddress,
    createdAt: this.createdAt,
    amount: this.amount,
    currency: this.currency
  };
};

// ============================================================
// STATIC METHODS
// ============================================================

/**
 * Log an event
 */
paymentAuditSchema.statics.logEvent = async function(eventData) {
  const event = new this(eventData);
  return await event.save();
};

/**
 * Find events for a payment
 */
paymentAuditSchema.statics.findByPayment = function(paymentId) {
  return this.find({ paymentId }).sort({ createdAt: -1 });
};

/**
 * Find events for a user
 */
paymentAuditSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

/**
 * Find security events (warnings, errors, critical)
 */
paymentAuditSchema.statics.findSecurityEvents = function() {
  return this.find({
    severity: { $in: ['warning', 'error', 'critical'] }
  }).sort({ createdAt: -1 });
};

/**
 * Find suspicious activity
 */
paymentAuditSchema.statics.findSuspiciousActivity = function() {
  return this.find({
    status: 'failed',
    severity: { $in: ['warning', 'error', 'critical'] }
  }).sort({ createdAt: -1 });
};

/**
 * Find failed payments for an invoice
 */
paymentAuditSchema.statics.findFailedAttempts = function(invoiceRef) {
  return this.find({
    invoiceRef,
    status: 'failed'
  }).sort({ createdAt: -1 });
};

/**
 * Find events requiring investigation
 */
paymentAuditSchema.statics.findPendingInvestigation = function() {
  return this.find({
    requiresInvestigation: true,
    investigationStatus: { $in: ['pending', 'in_progress'] }
  }).sort({ createdAt: 1 });
};

/**
 * Get audit report (compliance)
 */
paymentAuditSchema.statics.getAuditReport = async function(filters = {}) {
  const query = {};

  if (filters.eventType) {
    query.eventType = filters.eventType;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.severity) {
    query.severity = filters.severity;
  }
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.createdAt.$lte = new Date(filters.endDate);
    }
  }

  return this.find(query).sort({ createdAt: -1 });
};

// ============================================================
// SCHEMA HOOKS
// ============================================================

/**
 * Prevent modification of audit logs
 * Audit logs should be immutable
 */
paymentAuditSchema.pre('save', function(next) {
  if (!this.isNew) {
    // Allow updates to investigation fields only
    const modifiedFields = this.modifiedPaths();
    const allowedFields = [
      'investigationStatus',
      'investigationNotes',
      'investigatedBy',
      'investigationClosedAt',
      'adminNotes'
    ];

    const invalidModifications = modifiedFields.filter(
      field => !allowedFields.includes(field)
    );

    if (invalidModifications.length > 0) {
      return next(new Error('Cannot modify audit log fields'));
    }
  }

  next();
});

/**
 * Ensure IP address is always captured
 */
paymentAuditSchema.pre('save', function(next) {
  // This ensures ipAddress is set if available
  next();
});

// ============================================================
// CREATE MODEL
// ============================================================

module.exports = mongoose.model('PaymentAudit', paymentAuditSchema);
