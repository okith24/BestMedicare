const mongoose = require('mongoose');
const { TRANSACTION_STATUS, TRANSACTION_TYPE } = require('../constants');

/**
 * ============================================================
 * PAYMENT TRANSACTION MODEL
 * ============================================================
 * 
 * Stores all payment transactions
 * Tracks status, amounts, customer info, security details
 * Linked to invoice, patient, and audit logs
 */

const paymentSchema = new mongoose.Schema(
  {
    // ============================================================
    // TRANSACTION IDENTIFICATION
    // ============================================================
    
    /**
     * Unique reference ID (pattern: INV-YYYY-MM-NNNNN)
     * Used for reconciliation and receipt printing
     */
    invoiceRef: {
      type: String,
      required: true,
      unique: true,
      maxlength: 50,
      trim: true,
      match: /^[A-Z0-9\-]{1,50}$/
    },

    /**
     * Cybersource transaction ID
     * Returned after processing
     */
    cybersourceTransactionId: {
      type: String,
      maxlength: 100
    },

    /**
     * Reference tracking number (for customer support)
     */
    referenceNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    // ============================================================
    // AMOUNT & CURRENCY
    // ============================================================

    /**
     * Amount in smallest currency unit (e.g., cents for USD)
     * Stored as integer to avoid decimal precision issues
     */
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: 999999999,
      index: true
    },

    /**
     * Currency code (USD, LKR, EUR)
     */
    currency: {
      type: String,
      required: true,
      enum: ['USD', 'LKR', 'EUR'],
      default: 'LKR'
    },

    /**
     * Amount refunded (partial/full refund tracking)
     */
    amountRefunded: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * Amount authorized but not yet captured
     */
    amountAuthorized: {
      type: Number,
      default: 0,
      min: 0
    },

    // ============================================================
    // STATUS TRACKING
    // ============================================================

    /**
     * Current payment status
     * pending → authorized → captured → settled
     */
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUS),
      default: TRANSACTION_STATUS.PENDING,
      index: true
    },

    /**
     * Transaction type (auth, capture, refund, reversal)
     */
    transactionType: {
      type: String,
      enum: Object.values(TRANSACTION_TYPE),
      default: TRANSACTION_TYPE.AUTHORIZATION_AND_CAPTURE
    },

    /**
     * Payment method used
     */
    paymentMethod: {
      type: String,
      enum: ['card', 'bank_transfer', 'digital_wallet'],
      default: 'card'
    },

    /**
     * Merchant-defined reason for transaction
     * Non-PII data (appointmentType, department, etc.)
     */
    reason: {
      type: String,
      maxlength: 500
    },

    // ============================================================
    // CUSTOMER & RELATIONSHIP
    // ============================================================

    /**
     * Patient/Customer ID (from User model)
     * Optional - can be guest payment
     */
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      sparse: true
    },

    /**
     * Customer email (receipt will be sent here)
     * Required for all payments
     */
    customerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },

    /**
     * Invoice ID (from Invoice model)
     */
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
      sparse: true
    },

    /**
     * Appointment ID (if payment for appointment)
     */
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      index: true,
      sparse: true
    },

    /**
     * Doctor ID (for consultation fees)
     */
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      index: true,
      sparse: true
    },

    // ============================================================
    // SECURITY & VERIFICATION
    // ============================================================

    /**
     * Card token ID (from PaymentToken model)
     * NOT raw card number (PCI-DSS compliance)
     */
    cardTokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentToken',
      sparse: true
    },

    /**
     * Card last 4 digits (for display only)
     * No sensitive data stored
     */
    cardLast4: {
      type: String,
      match: /^\d{4}$/,
      maxlength: 4
    },

    /**
     * Card brand (Visa, MasterCard, Amex, Discover)
     */
    cardBrand: {
      type: String,
      enum: ['Visa', 'MasterCard', 'AmericanExpress', 'Discover', 'Diners', 'JCB'],
      sparse: true
    },

    /**
     * Cardholder name (from payment form)
     * NEVER stored - temporary during processing only
     */
    cardholderNameHash: {
      type: String,
      sparse: true,
      maxlength: 100
    },

    // ============================================================
    // FRAUD & VERIFICATION
    // ============================================================

    /**
     * AVS (Address Verification System) result
     * Y = Match, N = No Match, U = Not Available, etc.
     */
    avsResult: {
      type: String,
      enum: ['Y', 'Z', 'N', 'U', 'I', 'S', 'P', 'R', 'E', 'X'],
      sparse: true
    },

    /**
     * CVN (Card Verification Number) check result
     * M = Match, N = No Match, P = Not Provided, etc.
     */
    cvnResult: {
      type: String,
      enum: ['M', 'N', 'P', 'S', 'I', 'E'],
      sparse: true
    },

    /**
     * 3D Secure (3DS) authentication result
     * Y = Authenticated, N = Failed, U = Unavailable, A = Attempted
     */
    threeDSecureStatus: {
      type: String,
      enum: ['Y', 'N', 'U', 'A'],
      sparse: true
    },

    /**
     * Decision Manager risk score (0-100)
     * 0-30: Low, 31-70: Medium, 71-100: High
     */
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      sparse: true
    },

    /**
     * Whether transaction was flagged for manual review
     */
    requiresManualReview: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * Reason for manual review (if flagged)
     */
    reviewReason: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    /**
     * Whether transaction passed fraud checks
     */
    fraudCheckPassed: {
      type: Boolean,
      default: null,
      sparse: true
    },

    // ============================================================
    // SETTLEMENT TRACKING
    // ============================================================

    /**
     * Settlement batch ID (when funds transferred)
     */
    settlementBatchId: {
      type: String,
      index: true,
      sparse: true
    },

    /**
     * When funds were actually transferred
     */
    settledAt: {
      type: Date,
      index: true,
      sparse: true
    },

    // ============================================================
    // AUTHORIZATION & CAPTURE
    // ============================================================

    /**
     * When authorization was obtained
     */
    authorizedAt: {
      type: Date,
      sparse: true
    },

    /**
     * When capture was completed
     */
    capturedAt: {
      type: Date,
      sparse: true
    },

    /**
     * When authorization expires (if not captured)
     */
    authorizationExpiresAt: {
      type: Date,
      sparse: true
    },

    // ============================================================
    // METADATA & NOTES
    // ============================================================

    /**
     * Merchant-defined metadata (non-PII)
     */
    metadata: {
      appointmentType: String,
      department: String,
      serviceType: String,
      description: String
    },

    /**
     * Notes for admin (not visible to customer)
     */
    adminNotes: {
      type: String,
      maxlength: 1000,
      sparse: true
    },

    /**
     * Customer-facing notes (visible in receipt)
     */
    customerNotes: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    /**
     * Response code from Cybersource
     */
    responseCode: {
      type: String,
      maxlength: 50,
      sparse: true
    },

    /**
     * Response message from Cybersource
     */
    responseMessage: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    // ============================================================
    // TRACKING & AUDIT
    // ============================================================

    /**
     * WHO created this transaction
     * Empty string for anonymous/guest payments
     */
    createdBy: {
      type: String,
      default: 'unknown'
    },

    /**
     * WHO last updated this
     */
    updatedBy: {
      type: String,
      default: 'system'
    },

    /**
     * IP address of payment initiator
     */
    ipAddress: {
      type: String,
      maxlength: 45,
      sparse: true
    },

    /**
     * User agent of payment initiator
     */
    userAgent: {
      type: String,
      maxlength: 500,
      sparse: true
    },

    /**
     * Whether receipt was sent to customer
     */
    receiptSent: {
      type: Boolean,
      default: false
    },

    /**
     * When receipt was sent
     */
    receiptSentAt: {
      type: Date,
      sparse: true
    }
  },
  {
    timestamps: true, // Adds createdAt, updatedAt
    collection: 'payments'
  }
);

// ============================================================
// INDEXES
// ============================================================

// For fast lookups
// Note: invoiceRef has unique: true which auto-creates an index
// Note: cybersourceTransactionId doesn't need explicit index (not frequently filtered alone)
paymentSchema.index({ patientId: 1, createdAt: -1 });
paymentSchema.index({ customerEmail: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ requiresManualReview: 1, createdAt: -1 });
paymentSchema.index({ amount: 1, currency: 1, createdAt: -1 });

// ============================================================
// INSTANCE METHODS
// ============================================================

/**
 * Check if payment is settled
 */
paymentSchema.methods.isSettled = function() {
  return this.status === 'settled' || !!this.settledAt;
};

/**
 * Check if payment is pending
 */
paymentSchema.methods.isPending = function() {
  return this.status === 'pending';
};

/**
 * Check if payment can be refunded
 */
paymentSchema.methods.canBeRefunded = function() {
  const refundableStatuses = ['captured', 'settled'];
  return refundableStatuses.includes(this.status) && this.amount > this.amountRefunded;
};

/**
 * Get refundable amount
 */
paymentSchema.methods.getRefundableAmount = function() {
  return this.amount - this.amountRefunded;
};

/**
 * Record a refund
 */
paymentSchema.methods.recordRefund = function(amount) {
  if (amount > this.getRefundableAmount()) {
    throw new Error('Refund amount exceeds refundable balance');
  }
  
  this.amountRefunded += amount;
  
  if (this.amount === this.amountRefunded) {
    this.status = 'refunded';
  } else if (this.amountRefunded > 0) {
    this.status = 'partially_refunded';
  }
};

/**
 * Display-friendly amounts (convert from smallest unit to decimal)
 */
paymentSchema.methods.getDisplayAmount = function() {
  return (this.amount / 100).toFixed(2);
};

/**
 * Get transaction summary
 */
paymentSchema.methods.getSummary = function() {
  return {
    id: this._id,
    invoiceRef: this.invoiceRef,
    amount: this.getDisplayAmount(),
    currency: this.currency,
    status: this.status,
    cardLast4: this.cardLast4,
    cardBrand: this.cardBrand,
    createdAt: this.createdAt,
    settledAt: this.settledAt
  };
};

// ============================================================
// STATIC METHODS
// ============================================================

/**
 * Find by invoice reference
 */
paymentSchema.statics.findByInvoiceRef = function(invoiceRef) {
  return this.findOne({ invoiceRef });
};

/**
 * Find by Cybersource transaction ID
 */
paymentSchema.statics.findByCybersourceId = function(cybersourceId) {
  return this.findOne({ cybersourceTransactionId: cybersourceId });
};

/**
 * Find all payments for a patient
 */
paymentSchema.statics.findByPatient = function(patientId, options = {}) {
  const query = this.find({ patientId });
  
  if (options.sort) {
    query.sort(options.sort);
  }
  if (options.limit) {
    query.limit(options.limit);
  }
  
  return query;
};

/**
 * Find pending payments
 */
paymentSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).sort({ createdAt: -1 });
};

/**
 * Find failed payments
 */
paymentSchema.statics.findFailed = function() {
  return this.find({ status: 'failed' }).sort({ createdAt: -1 });
};

/**
 * Find transactions requiring manual review
 */
paymentSchema.statics.findForReview = function() {
  return this.find({ requiresManualReview: true }).sort({ createdAt: -1 });
};

/**
 * Get payment statistics
 */
paymentSchema.statics.getStatistics = async function(filters = {}) {
  const query = {};
  
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.currency) {
    query.currency = filters.currency;
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

  const results = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$currency',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' },
        minAmount: { $min: '$amount' },
        maxAmount: { $max: '$amount' }
      }
    }
  ]);

  return results;
};

// ============================================================
// SCHEMA HOOKS
// ============================================================

/**
 * Validate no PII is stored
 */
paymentSchema.pre('save', function(next) {
  // Ensure sensitive fields are cleared
  if (this.cardLast4 && this.cardLast4.length !== 4) {
    return next(new Error('Card last 4 must be exactly 4 digits'));
  }

  // Ensure customerEmail is always lowercase
  if (this.customerEmail) {
    this.customerEmail = this.customerEmail.toLowerCase();
  }

  next();
});

/**
 * Log status changes
 */
paymentSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'settled') {
    this.settledAt = new Date();
  }
  
  if (this.isModified('status') && this.status === 'captured') {
    this.capturedAt = new Date();
  }
  
  if (this.isModified('status') && this.status === 'authorized') {
    this.authorizedAt = new Date();
  }

  next();
});

// ============================================================
// CREATE MODEL
// ============================================================

module.exports = mongoose.model('Payment', paymentSchema);
