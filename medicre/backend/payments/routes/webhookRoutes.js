const express = require('express');
const router = express.Router();

// Model imports
const Payment = require('../models/Payment');
const PaymentAudit = require('../models/PaymentAudit');

// Utility imports
const {
  verifyWebhookSignature,
  parseWebhookNotification,
  getPaymentStatusFromDecision,
  isValidStatusTransition,
  createWebhookAuditLog,
  shouldAlertAdmin,
  createIdempotencyKey
} = require('../webhookHandler');

/**
 * ============================================================
 * WEBHOOK ROUTES - CYBERSOURCE NOTIFICATIONS
 * ============================================================
 * 
 * POST /api/payments/webhooks/cybersource - Receive payment notifications
 * GET  /api/payments/webhooks/status      - Get webhook delivery status
 */

/**
 * Webhooks must:
 * 1. Verify signature to prevent fake notifications
 * 2. Process quickly (Cybersource retries if > 30 seconds)
 * 3. Be idempotent (same notification = same result)
 * 4. Return 200 OK even on internal errors (Cybersource stops retrying)
 * 5. Prevent PII exposure in webhook URLs/logs
 */

/**
 * ============================================================
 * HELPER RESPONSE FUNCTIONS
 * ============================================================
 */

function sendSuccess(res, statusCode = 200) {
  return res.status(statusCode).json({
    received: true,
    timestamp: new Date().toISOString()
  });
}

function sendError(res, statusCode = 500) {
  // Always return 200 for webhooks to stop Cybersource retries
  // Internal error won't trigger more retries
  return res.status(200).json({
    received: false,
    timestamp: new Date().toISOString()
  });
}

/**
 * ============================================================
 * ROUTE: POST /api/payments/webhooks/cybersource
 * ============================================================
 * 
 * Receive webhook notification from Cybersource
 * 
 * Headers:
 *   X-CYBERSOURCE-SIGNATURE: HMAC-SHA256 signature
 *   Content-Type: application/json
 * 
 * Body (Cybersource notification):
 * {
 *   "id": "transaction-uuid",
 *   "merchantReferenceCode": "INV-2024-001",
 *   "decision": "ACCEPT|DECLINE|ERROR|REVIEW",
 *   "orderInformation": {
 *     "amountDetails": {
 *       "totalAmount": "5000",
 *       "currency": "USD"
 *     }
 *   },
 *   "paymentInformation": {
 *     "card": {
 *       "suffix": "4242",
 *       "cardType": "Visa"
 *     }
 *   },
 *   "processorInformation": {
 *     "avs": { "code": "M" },
 *     "cvn": { "code": "M" }
 *   },
 *   "riskInformation": {
 *     "score": 35
 *   },
 *   "eventTimestamp": "2024-01-20T15:30:00Z"
 * }
 * 
 * Processing:
 * 1. Verify webhook signature (prevent spoofing)
 * 2. Parse notification
 * 3. Create idempotency key (prevent duplicate processing)
 * 4. Check if already processed (check PaymentAudit)
 * 5. Find payment by merchantReferenceCode
 * 6. Validate state transition
 * 7. Update payment status
 * 8. Create PaymentAudit entry
 * 9. Send alerts if needed (fraud, manual review)
 * 10. Return 200 OK
 */
router.post('/cybersource', async (req, res) => {
  try {
    // Get raw body for signature verification
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-cybersource-signature'];
    const secretKey = process.env.CYBERSOURCE_WEBHOOK_SECRET;

    // TODO: Implementation Steps
    // =====================================================

    // Step 1: Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature, secretKey)) {
      console.warn('Invalid webhook signature - possible spoofing attempt');
      return sendError(res, 400); // Reject without updating DB
    }

    // Step 2: Parse notification
    let notification;
    try {
      notification = parseWebhookNotification(req.body);
    } catch (error) {
      console.error('Failed to parse webhook:', error.message);
      return sendError(res);
    }

    // Step 3: Create idempotency key
    const idempotencyKey = createIdempotencyKey(notification);

    // Step 4: Check if already processed
    const existingAudit = await PaymentAudit.findOne({
      'webhookData.idempotencyKey': idempotencyKey
    });
    if (existingAudit) {
      console.log('Duplicate webhook - already processed');
      return sendSuccess(res); // Return 200 to stop retries
    }

    // Step 5: Find payment by merchant reference
    const invoiceRef = notification.merchantReferenceCode;
    const payment = await Payment.findByInvoiceRef(invoiceRef);
    if (!payment) {
      console.error(`Payment not found for invoice: ${invoiceRef}`);
      // Still return 200 (Cybersource can't resolve this)
      await PaymentAudit.create({
        eventType: 'webhook_received',
        status: 'failed',
        severity: 'error',
        invoiceRef,
        cybersourceTransactionId: notification.transactionId,
        description: 'Webhook received but payment not found',
        reason: 'Payment does not exist in system'
      });
      return sendError(res);
    }

    // Step 6: Validate state transition
    const newStatus = getPaymentStatusFromDecision(notification.decision);
    if (!isValidStatusTransition(payment.status, newStatus)) {
      console.warn(
        `Invalid status transition: ${payment.status} -> ${newStatus}`
      );
      await PaymentAudit.create({
        eventType: 'webhook_received',
        status: 'warning',
        severity: 'warning',
        paymentId: payment._id,
        invoiceRef,
        cybersourceTransactionId: notification.transactionId,
        description: 'Invalid state transition rejected',
        reason: `Cannot transition from ${payment.status} to ${newStatus}`
      });
      return sendSuccess(res); // Return 200 (can't process but don't retry)
    }

    // Step 7: Update payment
    payment.status = newStatus;
    payment.cybersourceTransactionId = notification.transactionId;
    if (notification.transactionId) {
      payment.capturedAt = new Date(notification.eventTimestamp);
    }
    if (notification.riskScore) {
      payment.riskScore = notification.riskScore;
    }
    if (notification.avsResult) {
      payment.avsResult = notification.avsResult;
    }
    if (notification.cvnResult) {
      payment.cvnResult = notification.cvnResult;
    }
    payment.requiresManualReview =
      newStatus === 'pending_review' ||
      (notification.riskScore && notification.riskScore > 70);

    await payment.save();

    // Step 8: Create audit entry
    const auditLog = createWebhookAuditLog(
      notification,
      'success',
      'Webhook processed successfully'
    );
    await PaymentAudit.create({
      ...auditLog,
      paymentId: payment._id,
      webhookData: {
        idempotencyKey,
        decision: notification.decision,
        riskScore: notification.riskScore
      }
    });

    // Step 9: Send alerts if needed
    if (shouldAlertAdmin(notification)) {
      console.log(
        `Admin alert needed for payment ${payment._id}: ${notification.decision}`
      );
      // TODO: Send email alert to admin
      await PaymentAudit.create({
        eventType: 'fraud_suspicious',
        status: 'warning',
        severity: notification.riskScore > 70 ? 'critical' : 'warning',
        paymentId: payment._id,
        invoiceRef,
        cybersourceTransactionId: notification.transactionId,
        description: 'High-risk payment requires review',
        fraudData: {
          riskScore: notification.riskScore,
          decision: notification.decision,
          avsResult: notification.avsResult,
          cvnResult: notification.cvnResult
        },
        requiresInvestigation: true
      });
    }

    // Step 10: Return success
    return sendSuccess(res, 200);
  } catch (error) {
    console.error('Webhook processing error:', error.message);
    // Return 200 OK to prevent Cybersource retries
    return sendError(res, 500);
  }
});

/**
 * ============================================================
 * ROUTE: GET /api/payments/webhooks/status
 * ============================================================
 * 
 * Check webhook delivery status (admin only)
 * 
 * Query Parameters:
 *   invoiceRef: Filter by invoice
 *   days: 7 (last 7 days)
 *   status: success|failed|pending
 * 
 * Response:
 * {
 *   "webhooks": [
 *     {
 *       "id": "webhook-uuid",
 *       "eventType": "payment_captured",
 *       "status": "success",
 *       "deliveredAt": "2024-01-20T15:30:00Z",
 *       "attempts": 1,
 *       "invoiceRef": "INV-2024-001"
 *     }
 *   ],
 *   "successRate": 99.5,
 *   "totalWebhooks": 200,
 *   "successCount": 199,
 *   "failedCount": 1
 * }
 */
router.get('/status', async (req, res) => {
  try {
    // TODO: Implementation
    // 1. Verify user is admin
    // 2. Query PaymentAudit for webhook events
    // 3. Filter by invoiceRef if provided
    // 4. Filter by date range (default last 7 days)
    // 5. Filter by status if provided
    // 6. Calculate success rate
    // 7. Return paginated results

    const { invoiceRef, days = 7, status } = req.query;

    // Placeholder response
    return res.status(200).json({
      webhooks: [
        {
          id: 'webhook-uuid-1',
          eventType: 'payment_captured',
          status: 'success',
          deliveredAt: '2024-01-20T15:30:00Z',
          attempts: 1,
          invoiceRef: 'INV-2024-001'
        }
      ],
      successRate: 99.5,
      totalWebhooks: 200,
      successCount: 199,
      failedCount: 1,
      period: `Last ${days} days`
    });
  } catch (error) {
    console.error('Webhook status error:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve webhook status',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * ============================================================
 * ROUTE: POST /api/payments/webhooks/retry/:id
 * ============================================================
 * 
 * Manually retry failed webhook (admin only)
 * 
 * Response:
 * {
 *   "webhookId": "webhook-uuid",
 *   "status": "pending",
 *   "message": "Webhook retry initiated"
 * }
 */
router.post('/retry/:id', async (req, res) => {
  try {
    // TODO: Implementation
    // 1. Verify user is admin
    // 2. Find webhook by ID
    // 3. Check if it failed (status = failed)
    // 4. Re-queue for processing
    // 5. Update audit log
    // 6. Return status

    const { id } = req.params;

    return res.status(202).json({
      webhookId: id,
      status: 'pending',
      message: 'Webhook retry initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Webhook retry error:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retry webhook',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * ============================================================
 * ROUTE: POST /api/payments/webhooks/test
 * ============================================================
 * 
 * Send test webhook (development only)
 * 
 * Body:
 * {
 *   "decision": "ACCEPT",
 *   "invoiceRef": "TEST-001"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Test webhook processed"
 * }
 */
router.post('/test', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Test webhooks not allowed in production'
      });
    }

    // TODO: Implementation
    // 1. Create mock webhook payload
    // 2. Verify signature with test secret
    // 3. Send through webhook handler
    // 4. Return result

    const { decision = 'ACCEPT', invoiceRef = 'TEST-001' } = req.body;

    return res.status(200).json({
      success: true,
      message: 'Test webhook processed',
      webhook: {
        decision,
        invoiceRef,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test webhook error:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Test webhook processing failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * ============================================================
 * WEBHOOK MIDDLEWARE - PARSE RAW BODY
 * ============================================================
 * 
 * Important: Raw request body needed for signature verification
 * This middleware should be applied to the router
 */

router.use((req, res, next) => {
  let data = '';

  req.on('data', chunk => {
    data += chunk;
  });

  req.on('end', () => {
    req.rawBody = data;
    req.body = JSON.parse(data);
    next();
  });
});

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = router;
