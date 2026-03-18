const crypto = require('crypto');

/**
 * ============================================================
 * WEBHOOK HANDLER - CYBERSOURCE NOTIFICATIONS
 * ============================================================
 * 
 * Receives and processes Cybersource payment notifications
 * Validates webhook signatures for security
 * Updates payment status based on notifications
 * Ensures idempotency (no duplicate processing)
 */

/**
 * ============================================================
 * WEBHOOK SIGNATURE VERIFICATION
 * ============================================================
 */

/**
 * Verify webhook signature from Cybersource
 * Prevents fake webhook notifications from affecting payments
 * @param {String} body - Raw webhook body as string
 * @param {String} signature - Signature from X-CYBERSOURCE-SIGNATURE header
 * @param {String} secretKey - Webhook secret key
 * @returns {Boolean} True if signature is valid
 */
function verifyWebhookSignature(body, signature, secretKey) {
  try {
    if (!body || !signature || !secretKey) {
      return false;
    }

    // Create HMAC-SHA256 of body
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(body);
    const expectedSignature = hmac.digest('hex');

    // Timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('Webhook signature verification error:', error.message);
    return false;
  }
}

/**
 * ============================================================
 * WEBHOOK PARSING
 * ============================================================
 */

/**
 * Parse webhook notification from Cybersource
 * @param {Object} data - Webhook payload
 * @returns {Object} Parsed notification data
 */
function parseWebhookNotification(data) {
  try {
    if (!data) {
      throw new Error('Webhook data is empty');
    }

    // Extract key information
    const notification = {
      // Transaction identification
      transactionId: data.id,
      merchantReferenceCode: data.merchantReferenceCode,
      
      // Status from Cybersource
      decision: data.decision, // ACCEPT, DECLINE, ERROR, REVIEW
      processorResponse: data.processorResponse,
      
      // Amount and currency
      amount: data.orderInformation?.amountDetails?.totalAmount,
      currency: data.orderInformation?.amountDetails?.currency,
      
      // Payment method
      paymentMethod: data.paymentInformation?.payment?.paymentType,
      cardLast4: data.paymentInformation?.card?.suffix,
      cardBrand: data.paymentInformation?.card?.cardType,
      
      // Fraud and verification
      riskScore: data.riskInformation?.score,
      avsResult: data.processorInformation?.avs?.code,
      cvnResult: data.processorInformation?.cvn?.code,
      threeDSecure: data.consumerAuthenticationInformation?.authenticationResult,
      
      // Timestamp
      eventTimestamp: data.eventTimestamp || new Date().toISOString(),
      
      // Raw data for logging
      rawData: data
    };

    return notification;
  } catch (error) {
    throw new Error(`Failed to parse webhook notification: ${error.message}`);
  }
}

/**
 * ============================================================
 * WEBHOOK EVENT HANDLING
 * ============================================================
 */

/**
 * Determine payment status from Cybersource decision
 * @param {String} decision - Cybersource decision (ACCEPT, DECLINE, ERROR, REVIEW)
 * @param {String} processorResponse - Processor response code
 * @returns {String} Payment status for database
 */
function getPaymentStatusFromDecision(decision, processorResponse = null) {
  switch (decision) {
    case 'ACCEPT':
      return 'captured'; // Payment successful
    case 'DECLINE':
      return 'declined'; // Payment rejected
    case 'ERROR':
      return 'failed'; // Processing error
    case 'REVIEW':
      return 'pending_review'; // Flagged for manual review
    default:
      return 'unknown';
  }
}

/**
 * Determine if webhook represents a successful payment
 * @param {String} decision - Payment decision
 * @returns {Boolean} True if successful
 */
function isPaymentSuccessful(decision) {
  return decision === 'ACCEPT';
}

/**
 * Determine if payment was declined
 * @param {String} decision - Payment decision
 * @returns {Boolean} True if declined
 */
function isPaymentDeclined(decision) {
  return decision === 'DECLINE';
}

/**
 * Determine if payment needs manual review
 * @param {String} decision - Payment decision
 * @param {Number} riskScore - Fraud risk score (0-100)
 * @returns {Boolean} True if needs review
 */
function needsManualReview(decision, riskScore = null) {
  if (decision === 'REVIEW') {
    return true;
  }

  // High risk score also requires review
  if (riskScore !== null && riskScore > 70) {
    return true;
  }

  return false;
}

/**
 * ============================================================
 * IDEMPOTENCY HANDLING
 * ============================================================
 */

/**
 * Create idempotency key from webhook data
 * Ensures same notification isn't processed twice
 * @param {Object} notification - Parsed notification
 * @returns {String} Unique idempotency key
 */
function createIdempotencyKey(notification) {
  const key = `${notification.transactionId}-${notification.eventTimestamp}`;
  
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * ============================================================
 * WEBHOOK RESPONSE HANDLING
 * ============================================================
 */

/**
 * Create success response for Cybersource
 * Must return 200 OK quickly to prevent retries
 * @returns {Object} Response object
 */
function createWebhookSuccessResponse() {
  return {
    statusCode: 200,
    body: {
      received: true,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Create error response for webhook
 * Don't expose details to Cybersource for security
 * @param {String} reason - Internal reason (never sent to Cybersource)
 * @returns {Object} Response object
 */
function createWebhookErrorResponse(reason = 'Processing error') {
  console.error(`Webhook processing error: ${reason}`);

  return {
    statusCode: 500,
    body: {
      received: false,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * ============================================================
 * AUDIT LOGGING
 * ============================================================
 */

/**
 * Create webhook audit log entry
 * @param {Object} notification - Parsed notification
 * @param {String} status - Processing status (success, failed, duplicate)
 * @param {String} reason - Reason for status
 * @returns {Object} Audit log object
 */
function createWebhookAuditLog(notification, status, reason = '') {
  return {
    timestamp: new Date().toISOString(),
    eventType: 'webhook_received',
    status,
    severity: status === 'success' ? 'info' : 'warning',
    
    // Transaction info
    transactionId: notification.transactionId,
    merchantReferenceCode: notification.merchantReferenceCode,
    decision: notification.decision,
    
    // Payment info
    amount: notification.amount,
    currency: notification.currency,
    
    // Security
    cardLast4: notification.cardLast4,
    cardBrand: notification.cardBrand,
    
    // Fraud info
    riskScore: notification.riskScore,
    avsResult: notification.avsResult,
    cvnResult: notification.cvnResult,
    
    // Processing
    reason,
    idempotencyKey: createIdempotencyKey(notification),
    
    // Raw data (for investigation)
    rawData: notification.rawData
  };
}

/**
 * ============================================================
 * WEBHOOK STATE TRANSITIONS
 * ============================================================
 */

/**
 * Determine valid state transition for payment
 * Prevents invalid status updates (e.g., captured -> pending)
 * @param {String} currentStatus - Current payment status
 * @param {String} newStatus - New status from webhook
 * @returns {Boolean} True if transition is valid
 */
function isValidStatusTransition(currentStatus, newStatus) {
  // Valid state transitions
  const validTransitions = {
    'pending': ['authorized', 'captured', 'declined', 'failed', 'pending_review'],
    'authorized': ['captured', 'declined', 'failed'],
    'captured': ['settled', 'refunded', 'partially_refunded'],
    'declined': [], // Final state
    'failed': [], // Final state
    'pending_review': ['captured', 'declined', 'failed'],
    'settled': ['refunded', 'partially_refunded'],
    'refunded': [], // Final state
    'partially_refunded': ['refunded']
  };

  const allowed = validTransitions[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * ============================================================
 * HELPER FUNCTIONS
 * ============================================================
 */

/**
 * Extract merchant reference from Cybersource notification
 * Links webhook back to our invoice
 * @param {Object} notification - Parsed notification
 * @returns {String} Invoice reference
 */
function extractInvoiceReference(notification) {
  return notification.merchantReferenceCode;
}

/**
 * Check if webhook should trigger alert to admin
 * @param {Object} notification - Parsed notification
 * @returns {Boolean} True if alert needed
 */
function shouldAlertAdmin(notification) {
  // Alert if:
  // 1. Fraud score is high
  if (notification.riskScore && notification.riskScore > 70) {
    return true;
  }

  // 2. Payment needs review
  if (needsManualReview(notification.decision, notification.riskScore)) {
    return true;
  }

  // 3. Unexpected decision
  if (notification.decision === 'ERROR') {
    return true;
  }

  // 4. Verification failures
  if (notification.avsResult === 'N' || notification.cvnResult === 'N') {
    return true;
  }

  return false;
}

/**
 * Generate human-readable webhook summary
 * @param {Object} notification - Parsed notification
 * @returns {String} Summary text
 */
function generateWebhookSummary(notification) {
  return `
    Transaction: ${notification.transactionId}
    Decision: ${notification.decision}
    Amount: ${notification.amount} ${notification.currency}
    Card: ${notification.cardBrand} ****${notification.cardLast4}
    Risk: ${notification.riskScore ? notification.riskScore : 'N/A'}
    Timestamp: ${notification.eventTimestamp}
  `.trim();
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Verification
  verifyWebhookSignature,

  // Parsing
  parseWebhookNotification,

  // Event handling
  getPaymentStatusFromDecision,
  isPaymentSuccessful,
  isPaymentDeclined,
  needsManualReview,

  // Idempotency
  createIdempotencyKey,

  // Responses
  createWebhookSuccessResponse,
  createWebhookErrorResponse,

  // Audit
  createWebhookAuditLog,

  // State management
  isValidStatusTransition,

  // Helpers
  extractInvoiceReference,
  shouldAlertAdmin,
  generateWebhookSummary
};
