const crypto = require('crypto');

/**
 * ============================================================
 * REFUND HANDLER - CYBERSOURCE REFUND PROCESSING
 * ============================================================
 * 
 * Manages refund and reversal operations
 * Validates refund eligibility
 * Tracks partial refunds
 * Prevents double refunds
 */

/**
 * ============================================================
 * REFUND ELIGIBILITY
 * ============================================================
 */

/**
 * Check if payment can be refunded
 * @param {Object} payment - Payment record from database
 * @param {Number} requestedAmount - Amount to refund (optional, full refund if null)
 * @returns {Object} {eligible: Boolean, reason: String}
 */
function canPaymentBeRefunded(payment, requestedAmount = null) {
  // Payment must exist
  if (!payment) {
    return { eligible: false, reason: 'Payment not found' };
  }

  // Payment must be captured/settled
  if (!['captured', 'settled'].includes(payment.status)) {
    return {
      eligible: false,
      reason: `Cannot refund payment with status: ${payment.status}`
    };
  }

  // Cannot refund if fully refunded
  if (payment.refundedAmount >= payment.amount) {
    return { eligible: false, reason: 'Payment already fully refunded' };
  }

  // If amount specified, validate it
  if (requestedAmount !== null) {
    if (requestedAmount <= 0) {
      return { eligible: false, reason: 'Refund amount must be positive' };
    }

    const refundableAmount = payment.amount - payment.refundedAmount;
    if (requestedAmount > refundableAmount) {
      return {
        eligible: false,
        reason: `Refund amount exceeds available amount (${refundableAmount})`
      };
    }
  }

  // Check if refund window has passed (typically 180 days)
  const refundWindowDays = 180;
  const capturedAt = new Date(payment.capturedAt);
  const daysSinceCaptured = Math.floor(
    (Date.now() - capturedAt) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCaptured > refundWindowDays) {
    return {
      eligible: false,
      reason: `Payment captured ${daysSinceCaptured} days ago (limit: ${refundWindowDays} days)`
    };
  }

  return { eligible: true, reason: null };
}

/**
 * ============================================================
 * REFUND CALCULATION
 * ============================================================
 */

/**
 * Calculate refund breakdown
 * @param {Object} payment - Payment record
 * @param {Number} requestedAmount - Amount to refund (optional)
 * @returns {Object} Refund details
 */
function calculateRefundAmount(payment, requestedAmount = null) {
  const refundable = payment.amount - payment.refundedAmount;

  // If no amount specified, refund full available amount
  const refundAmount = requestedAmount || refundable;

  // Validate
  if (refundAmount < 0 || refundAmount > refundable) {
    throw new Error(
      `Invalid refund amount: ${refundAmount} (refundable: ${refundable})`
    );
  }

  return {
    refundAmount,
    newRefundedTotal: payment.refundedAmount + refundAmount,
    remainingBalance: refundable - refundAmount,
    isFullRefund: refundAmount === refundable,
    isPartialRefund: refundAmount > 0 && refundAmount < refundable
  };
}

/**
 * ============================================================
 * REFUND REQUEST BUILDING
 * ============================================================
 */

/**
 * Build refund request for Cybersource API
 * @param {Object} payment - Payment record
 * @param {Number} refundAmount - Amount to refund
 * @param {String} reason - Refund reason
 * @returns {Object} Cybersource refund request payload
 */
function buildCybersourceRefundRequest(payment, refundAmount, reason = '') {
  const idempotencyKey = generateRefundIdempotencyKey(
    payment.cybersourceTransactionId,
    refundAmount
  );

  return {
    clientReferenceInformation: {
      code: payment.invoiceRef,
      comments: reason || 'Refund requested'
    },

    processingInformation: {
      capture: true
    },

    orderInformation: {
      amountDetails: {
        totalAmount: refundAmount.toString(),
        currency: payment.currency
      }
    },

    // Link to original payment
    paymentInformation: {
      tokenizedCard: {
        transactionPayload: payment.cardTokenId
      }
    },

    // Idempotency
    headers: {
      'Idempotency-Key': idempotencyKey
    },

    // Metadata
    metadata: {
      originalTransactionId: payment.cybersourceTransactionId,
      refundReason: reason,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Build reversal request for Cybersource
 * Used for declining authorized but not captured payments
 * @param {Object} payment - Payment record
 * @param {String} reason - Reversal reason
 * @returns {Object} Cybersource reversal request
 */
function buildCybersourceReversalRequest(payment, reason = '') {
  return {
    clientReferenceInformation: {
      code: payment.invoiceRef,
      comments: reason || 'Authorization reversal requested'
    },

    reversal: {
      amount: payment.amount.toString()
    },

    headers: {
      'Idempotency-Key': generateRefundIdempotencyKey(
        payment.cybersourceTransactionId,
        payment.amount,
        'reversal'
      )
    }
  };
}

/**
 * ============================================================
 * IDEMPOTENCY FOR REFUNDS
 * ============================================================
 */

/**
 * Generate idempotency key for refund operations
 * Prevents duplicate refunds from being processed
 * @param {String} originalTransactionId - Cybersource transaction ID
 * @param {Number} amount - Refund amount
 * @param {String} type - Operation type (refund, reversal)
 * @returns {String} Idempotency key
 */
function generateRefundIdempotencyKey(
  originalTransactionId,
  amount,
  type = 'refund'
) {
  const key = `${type}-${originalTransactionId}-${amount}-${Date.now()}`;

  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create refund tracking key for database
 * @param {String} originalTransactionId - Cybersource transaction ID
 * @param {Number} amount - Refund amount
 * @returns {String} Tracking key
 */
function createRefundTrackingKey(originalTransactionId, amount) {
  const key = `${originalTransactionId}-${amount}`;

  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * ============================================================
 * REFUND STATE TRACKING
 * ============================================================
 */

/**
 * Create refund log entry
 * @param {Object} payment - Payment record
 * @param {Number} refundAmount - Amount being refunded
 * @param {String} status - Refund status (pending, processed, failed)
 * @param {String} reason - Refund reason
 * @param {String} cybersourceRefundId - Cybersource refund transaction ID (if available)
 * @returns {Object} Refund log
 */
function createRefundLogEntry(
  payment,
  refundAmount,
  status,
  reason = '',
  cybersourceRefundId = null
) {
  return {
    timestamp: new Date().toISOString(),
    paymentId: payment._id,
    invoiceRef: payment.invoiceRef,
    originalTransactionId: payment.cybersourceTransactionId,
    refundAmount,
    currency: payment.currency,
    refundStatus: status,
    refundReason: reason,
    cybersourceRefundId,
    trackingKey: createRefundTrackingKey(payment.cybersourceTransactionId, refundAmount),
    
    // Metadata
    cardLast4: payment.cardLast4,
    patientId: payment.patientId,
    invoiceId: payment.invoiceId
  };
}

/**
 * ============================================================
 * REFUND AUDIT LOGGING
 * ============================================================
 */

/**
 * Create audit log for refund operation
 * @param {Object} payment - Payment record
 * @param {Number} refundAmount - Amount refunded
 * @param {String} status - Processing status
 * @param {String} reason - Refund reason
 * @param {Object} additionalData - Extra info to log
 * @returns {Object} Audit log entry
 */
function createRefundAuditLog(
  payment,
  refundAmount,
  status,
  reason = '',
  additionalData = {}
) {
  return {
    eventType: 'refund_initiated',
    status,
    severity: status === 'success' ? 'info' : 'warning',
    
    // IDs
    paymentId: payment._id,
    invoiceRef: payment.invoiceRef,
    cybersourceTransactionId: payment.cybersourceTransactionId,
    
    // Refund info
    refundAmount,
    currency: payment.currency,
    refundReason: reason,
    
    // Payment info
    originalAmount: payment.amount,
    previouslyRefunded: payment.refundedAmount,
    
    // Security
    requestedBy: additionalData.requestedBy || 'system',
    ipAddress: additionalData.ipAddress,
    sessionId: additionalData.sessionId,
    
    // Tracking
    trackingKey: createRefundTrackingKey(payment.cybersourceTransactionId, refundAmount),
    
    // Raw data
    refundData: {
      reason,
      ...additionalData
    }
  };
}

/**
 * ============================================================
 * REFUND VALIDATION
 * ============================================================
 */

/**
 * Validate refund request
 * @param {Object} refundRequest - Refund request object
 * @param {Object} payment - Payment record
 * @returns {Object} {valid: Boolean, errors: []}
 */
function validateRefundRequest(refundRequest, payment) {
  const errors = [];

  // Check amount
  if (!refundRequest.amount || refundRequest.amount <= 0) {
    errors.push('Refund amount must be positive');
  }

  if (refundRequest.amount > payment.amount - payment.refundedAmount) {
    errors.push(
      `Refund amount exceeds available amount (${payment.amount - payment.refundedAmount})`
    );
  }

  // Check reason
  if (!refundRequest.reason || refundRequest.reason.trim().length === 0) {
    errors.push('Refund reason is required');
  }

  if (refundRequest.reason && refundRequest.reason.length > 500) {
    errors.push('Refund reason is too long (max 500 characters)');
  }

  // Check if refund window valid
  const capturedAt = new Date(payment.capturedAt);
  const daysSinceCaptured = Math.floor(
    (Date.now() - capturedAt) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCaptured > 180) {
    errors.push(`Payment is too old to refund (${daysSinceCaptured} days)`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * ============================================================
 * REFUND HELPERS
 * ============================================================
 */

/**
 * Determine refund method
 * Full refunds use different method than partial refunds sometimes
 * @param {Object} calculateResult - Result from calculateRefundAmount()
 * @returns {String} Method type (full_refund, partial_refund)
 */
function getRefundMethod(calculateResult) {
  return calculateResult.isFullRefund ? 'full_refund' : 'partial_refund';
}

/**
 * Check if refund was already processed
 * Prevents duplicate refunds
 * @param {Object} payment - Payment record
 * @param {Number} amount - Refund amount to check
 * @param {Array} refundHistory - Previous refunds
 * @returns {Object} {isDuplicate: Boolean, previousRefund: Object}
 */
function checkForDuplicateRefund(payment, amount, refundHistory = []) {
  // Look for identical refund in recent history
  const recentRefund = refundHistory.find(
    refund =>
      refund.refundAmount === amount &&
      new Date(refund.timestamp) > new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
  );

  if (recentRefund) {
    return { isDuplicate: true, previousRefund: recentRefund };
  }

  return { isDuplicate: false, previousRefund: null };
}

/**
 * Check refund status from Cybersource response
 * @param {Object} cybersourceResponse - Response from Cybersource API
 * @returns {String} Status (pending, processed, failed)
 */
function getRefundStatus(cybersourceResponse) {
  if (!cybersourceResponse) {
    return 'failed';
  }

  if (cybersourceResponse.decision === 'ACCEPT') {
    return 'processed';
  }

  if (cybersourceResponse.decision === 'REVIEW') {
    return 'pending';
  }

  return 'failed';
}

/**
 * Generate refund summary
 * @param {Object} payment - Payment record
 * @param {Number} refundAmount - Refund amount
 * @returns {String} Summary text
 */
function generateRefundSummary(payment, refundAmount) {
  return `
    Invoice: ${payment.invoiceRef}
    Original Amount: ${payment.amount} ${payment.currency}
    Refund Amount: ${refundAmount} ${payment.currency}
    Card: ${payment.cardBrand} ****${payment.cardLast4}
    Status: Pending
    Initiated: ${new Date().toISOString()}
  `.trim();
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Eligibility
  canPaymentBeRefunded,

  // Calculation
  calculateRefundAmount,

  // Request building
  buildCybersourceRefundRequest,
  buildCybersourceReversalRequest,

  // Idempotency
  generateRefundIdempotencyKey,
  createRefundTrackingKey,

  // State tracking
  createRefundLogEntry,

  // Audit
  createRefundAuditLog,

  // Validation
  validateRefundRequest,

  // Helpers
  getRefundMethod,
  checkForDuplicateRefund,
  getRefundStatus,
  generateRefundSummary
};
