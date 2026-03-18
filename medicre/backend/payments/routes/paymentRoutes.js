const express = require('express');
const router = express.Router();

// Model imports
const Payment = require('../models/Payment');
const PaymentToken = require('../models/PaymentToken');
const PaymentAudit = require('../models/PaymentAudit');

// Utility imports
const { signPaymentRequest, verifyPaymentResponse } = require('../security');
const { encryptToken } = require('../tokenization');
const { 
  buildCybersourceRefundRequest, 
  canPaymentBeRefunded, 
  calculateRefundAmount,
  createRefundAuditLog 
} = require('../refundHandler');
const {
  verifyWebhookSignature,
  parseWebhookNotification,
  getPaymentStatusFromDecision,
  isValidStatusTransition,
  createWebhookAuditLog
} = require('../webhookHandler');

// Config imports
const CybersourceAPI = require('../../../config/cybersource');

/**
 * ============================================================
 * PAYMENT ROUTES - CHARGE & TRANSACTION MANAGEMENT
 * ============================================================
 * 
 * POST   /api/payments/charge              - Process payment
 * POST   /api/payments/charge/:id/refund   - Refund payment
 * GET    /api/payments/:id                 - Get payment details
 * GET    /api/payments/invoice/:invoiceRef - Get payment by invoice
 * GET    /api/payments/patient/:patientId  - Get patient payments
 */

/**
 * Middleware imports
 * Each route should apply:
 * 1. validatePaymentCharge or validateRefund (input validation)
 * 2. blockPII (prevent PII in requests)
 * 3. CSRF protection (for state-changing operations)
 */

/**
 * ============================================================
 * HELPER RESPONSE FUNCTIONS
 * ============================================================
 */

/**
 * Send success response
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Send error response
 */
function sendError(res, message, statusCode = 400, details = null) {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      details,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * ============================================================
 * ROUTE: POST /api/payments/charge
 * ============================================================
 * 
 * Process payment charge
 * 
 * Request Body:
 * {
 *   "amount": 5000,
 *   "currency": "USD",
 *   "cardToken": "...",
 *   "invoiceRef": "INV-2024-001",
 *   "patientId": "patient-uuid",
 *   "description": "Medical services payment",
 *   "threeDSecure": true
 * }
 * 
 * Response:
 * {
 *   "transactionId": "xxx",
 *   "status": "captured",
 *   "amount": 5000,
 *   "currency": "USD"
 * }
 */
router.post(
  '/charge',
  // Middleware stack (to be applied when integrated)
  // validatePaymentCharge,
  // blockPII,
  // csrfProtection,
  async (req, res) => {
    try {
      const { amount, currency, cardToken, invoiceRef, patientId, description } =
        req.body;

      // Step 1: Validate card token is active
      const paymentToken = await PaymentToken.findById(cardToken);
      if (!paymentToken || !paymentToken.isActive()) {
        return sendError(
          res,
          'Payment token is invalid or expired',
          400
        );
      }

      // Step 2: Check for duplicate invoice
      const existingPayment = await Payment.findByInvoiceRef(invoiceRef);
      if (existingPayment) {
        return sendError(
          res,
          `Payment already exists for invoice ${invoiceRef}`,
          409
        );
      }

      // Step 3: Build Cybersource charge request
      const fieldsToBeSigned = {
        amount: (amount / 100).toFixed(2), // Convert cents to dollars
        currency,
        orderInformation: {
          amountDetails: {
            totalAmount: (amount / 100).toFixed(2),
            currency
          },
          billTo: {
            firstName: 'Patient',
            lastName: 'Payment',
            email: 'noreply@hospital.local'
          }
        },
        paymentInformation: {
          tokenizedCard: {
            transactionPayload: paymentToken.cybersourceToken
          }
        },
        clientReferenceInformation: {
          code: invoiceRef,
          comments: description || 'Medical service payment'
        }
      };

      // Step 4: Sign request with HMAC-SHA256
      const signature = signPaymentRequest(
        fieldsToBeSigned,
        process.env.CYBERSOURCE_SECRET_KEY
      );

      // Step 5: Add signature to request
      const chargeRequest = {
        ...fieldsToBeSigned,
        signature
      };

      // Step 6: Send to Cybersource API
      console.log(`Processing ${currency} ${amount / 100} charge for ${invoiceRef}`);
      const cybersourceResponse = await CybersourceAPI.makeRequest(
        'POST',
        '/pts/v2/payments',
        chargeRequest
      );

      // Step 7: Verify response signature
      const isSignatureValid = verifyPaymentResponse(
        cybersourceResponse,
        cybersourceResponse.signature,
        process.env.CYBERSOURCE_SECRET_KEY
      );

      if (!isSignatureValid) {
        console.error('Invalid Cybersource response signature');
        return sendError(
          res,
          'Payment verification failed',
          500
        );
      }

      // Step 8: Determine payment status from Cybersource response
      const paymentStatus = 
        cybersourceResponse.decision === 'ACCEPT' ? 'captured' :
        cybersourceResponse.decision === 'DECLINE' ? 'declined' :
        cybersourceResponse.decision === 'REVIEW' ? 'pending_review' :
        'failed';

      // Step 9: Create Payment record
      const payment = await Payment.create({
        invoiceRef,
        cybersourceTransactionId: cybersourceResponse.id,
        amount,
        currency,
        status: paymentStatus,
        transactionType: 'capture',
        patientId,
        invoiceId: req.body.invoiceId,
        cardTokenId: paymentToken._id,
        cardLast4: paymentToken.cardLast4,
        cardBrand: paymentToken.cardBrand,
        avsResult: cybersourceResponse.processorInformation?.avs?.code,
        cvnResult: cybersourceResponse.processorInformation?.cvn?.code,
        riskScore: cybersourceResponse.riskInformation?.score,
        requiresManualReview: paymentStatus === 'pending_review' || (cybersourceResponse.riskInformation?.score > 70),
        capturedAt: new Date()
      });

      // Step 10: Update token usage
      await paymentToken.markAsUsed();

      // Step 11: Create audit entry
      const auditLog = await PaymentAudit.create({
        eventType: 'payment_initiated',
        status: isSignatureValid ? 'success' : 'failed',
        severity: isSignatureValid ? 'info' : 'error',
        paymentId: payment._id,
        invoiceRef,
        cybersourceTransactionId: cybersourceResponse.id,
        paymentTokenId: paymentToken._id,
        description: `Payment of ${currency} ${amount / 100} initiated`,
        reason: 'Payment charge request',
        signatureData: {
          verified: isSignatureValid,
          algorithm: 'HMAC-SHA256'
        }
      });

      // Step 12: Log verification event
      await PaymentAudit.create({
        eventType: 'signature_verified',
        status: 'success',
        severity: 'info',
        paymentId: payment._id,
        invoiceRef,
        cybersourceTransactionId: cybersourceResponse.id,
        description: 'Payment response signature verified successfully'
      });

      // Step 13: If high risk, create fraud event
      if (cybersourceResponse.riskInformation?.score > 70) {
        await PaymentAudit.create({
          eventType: 'fraud_suspicious',
          status: 'warning',
          severity: 'warning',
          paymentId: payment._id,
          invoiceRef,
          cybersourceTransactionId: cybersourceResponse.id,
          description: `High fraud risk score: ${cybersourceResponse.riskInformation.score}`,
          fraudData: {
            riskScore: cybersourceResponse.riskInformation.score
          },
          requiresInvestigation: true
        });
      }

      // Step 14: Return response
      return sendSuccess(res, payment.getSummary(), 201);

    } catch (error) {
      console.error('Payment charge error:', error.message);
      
      // Create failure audit log
      await PaymentAudit.create({
        eventType: 'payment_initiated',
        status: 'failed',
        severity: 'error',
        invoiceRef: req.body.invoiceRef,
        description: 'Payment processing failed',
        reason: error.message,
        errorMessage: error.message
      }).catch(err => console.error('Audit log error:', err));

      return sendError(
        res,
        'Failed to process payment',
        500,
        error.message
      );
    }
  }
);

/**
 * ============================================================
 * ROUTE: POST /api/payments/charge/:id/refund
 * ============================================================
 * 
 * Refund a payment
 * 
 * Request Body:
 * {
 *   "amount": 2500,  // Optional, full refund if not provided
 *   "reason": "Customer request"
 * }
 * 
 * Response:
 * {
 *   "refundId": "REF-xxx",
 *   "status": "pending",
 *   "refundAmount": 2500,
 *   "originalAmount": 5000
 * }
 */
router.post(
  '/charge/:id/refund',
  // validateRefund middleware
  // blockPII,
  // csrfProtection,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      // Step 1: Find payment record by ID
      const payment = await Payment.findById(id);
      if (!payment) {
        return sendError(res, 'Payment not found', 404);
      }

      // Step 2: Verify payment is refundable
      const { eligible, reason: refundError } = canPaymentBeRefunded(payment, amount);
      if (!eligible) {
        return sendError(res, refundError, 400);
      }

      // Step 3: Calculate refund amount
      let refundAmount = amount;
      try {
        const calculation = calculateRefundAmount(payment, amount);
        refundAmount = calculation.refundAmount;
      } catch (error) {
        return sendError(res, error.message, 400);
      }

      // Step 4: Build Cybersource refund request
      const refundRequest = buildCybersourceRefundRequest(
        payment,
        refundAmount,
        reason || 'Customer requested'
      );

      // Step 5: Sign refund request
      const signature = signPaymentRequest(
        refundRequest,
        process.env.CYBERSOURCE_SECRET_KEY
      );
      refundRequest.signature = signature;

      // Step 6: Send refund to Cybersource API
      console.log(`Processing refund of ${payment.currency} ${refundAmount / 100} for payment ${payment._id}`);
      const cybersourceResponse = await CybersourceAPI.makeRequest(
        'POST',
        `/pts/v2/payments/${payment.cybersourceTransactionId}/refunds`,
        refundRequest
      );

      // Step 7: Verify refund response signature
      const isSignatureValid = verifyPaymentResponse(
        cybersourceResponse,
        cybersourceResponse.signature,
        process.env.CYBERSOURCE_SECRET_KEY
      );

      if (!isSignatureValid) {
        return sendError(res, 'Refund verification failed', 500);
      }

      // Step 8: Determine refund status
      const refundStatus = cybersourceResponse.decision === 'ACCEPT' ? 'processed' : 'failed';

      // Step 9: Update Payment record with refund info
      if (refundStatus === 'processed') {
        const calculation = calculateRefundAmount(payment, refundAmount);
        payment.refundedAmount = calculation.newRefundedTotal;
        payment.refundsCount = (payment.refundsCount || 0) + 1;
        
        // Update status if fully refunded
        if (calculation.isFullRefund) {
          payment.status = 'refunded';
        } else if (calculation.isPartialRefund) {
          payment.status = 'partially_refunded';
        }
        
        await payment.save();
      }

      // Step 10: Create refund audit log
      const refundLog = createRefundAuditLog(
        payment,
        refundAmount,
        refundStatus,
        reason
      );
      await PaymentAudit.create(refundLog);

      // Step 11: Log signature verification
      await PaymentAudit.create({
        eventType: 'refund_initiated',
        status: isSignatureValid ? 'success' : 'failed',
        severity: 'info',
        paymentId: payment._id,
        invoiceRef: payment.invoiceRef,
        cybersourceTransactionId: payment.cybersourceTransactionId,
        description: `Refund of ${payment.currency} ${refundAmount / 100} processed`,
        refundData: {
          amount: refundAmount,
          status: refundStatus,
          reason
        }
      });

      // Step 12: Return refund confirmation
      return sendSuccess(
        res,
        {
          refundId: cybersourceResponse.id,
          paymentId: id,
          status: refundStatus,
          refundAmount: refundAmount / 100,
          currency: payment.currency,
          newRefundedTotal: (payment.refundedAmount + refundAmount) / 100,
          message: 'Refund processing completed'
        },
        202
      );

    } catch (error) {
      console.error('Refund error:', error.message);
      
      // Log error
      await PaymentAudit.create({
        eventType: 'refund_initiated',
        status: 'failed',
        severity: 'error',
        paymentId: req.params.id,
        description: 'Refund processing failed',
        errorMessage: error.message
      }).catch(err => console.error('Audit log error:', err));

      return sendError(res, 'Failed to process refund', 500, error.message);
    }
  }
);

/**
 * ============================================================
 * ROUTE: GET /api/payments/:id
 * ============================================================
 * 
 * Get payment details
 * 
 * Response:
 * {
 *   "id": "payment-uuid",
 *   "invoiceRef": "INV-2024-001",
 *   "amount": 5000,
 *   "currency": "USD",
 *   "status": "captured",
 *   "cardLast4": "4242",
 *   "cardBrand": "Visa",
 *   "capturedAt": "2024-01-15T10:30:00Z",
 *   "refundedAmount": 0,
 *   "refundable": true
 * }
 */
router.get('/charge/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find payment by ID
    const payment = await Payment.findById(id);
    if (!payment) {
      return sendError(res, 'Payment not found', 404);
    }

    // Get safe display data
    const displayData = payment.getSummary();

    return sendSuccess(res, {
      ...displayData,
      refundable: payment.canBeRefunded(),
      refundableAmount: payment.amount - payment.refundedAmount
    });

  } catch (error) {
    console.error('Get payment error:', error.message);
    return sendError(
      res,
      'Failed to retrieve payment',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: GET /api/payments/invoice/:invoiceRef
 * ============================================================
 * 
 * Get payment by invoice reference
 * 
 * Response:
 * {
 *   "invoiceRef": "INV-2024-001",
 *   "paymentId": "payment-uuid",
 *   "amount": 5000,
 *   "status": "captured",
 *   "isPaid": true
 * }
 */
router.get('/invoice/:invoiceRef', async (req, res) => {
  try {
    const { invoiceRef } = req.params;

    // Find payment by invoiceRef using static method
    const payment = await Payment.findByInvoiceRef(invoiceRef);
    if (!payment) {
      return sendError(res, 'Payment not found for this invoice', 404);
    }

    // Return payment status and amount
    return sendSuccess(res, {
      invoiceRef,
      paymentId: payment._id,
      amount: payment.amount / 100,
      currency: payment.currency,
      status: payment.status,
      isPaid: payment.status === 'captured' || payment.status === 'settled',
      refundedAmount: payment.refundedAmount / 100,
      cardLast4: payment.cardLast4,
      cardBrand: payment.cardBrand,
      capturedAt: payment.capturedAt
    });

  } catch (error) {
    console.error('Get payment by invoice error:', error.message);
    return sendError(
      res,
      'Failed to retrieve payment',
      404,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: GET /api/payments/patient/:patientId
 * ============================================================
 * 
 * Get all payments for a patient
 * 
 * Query Parameters:
 *   status: "captured,refunded" - Filter by status
 *   limit: 20
 *   offset: 0
 * 
 * Response:
 * {
 *   "payments": [
 *     {
 *       "id": "payment-uuid",
 *       "invoiceRef": "INV-2024-001",
 *       "amount": 5000,
 *       "status": "captured",
 *       "date": "2024-01-15"
 *     }
 *   ],
 *   "total": 15000,
 *   "count": 3
 * }
 */
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, limit = 20, offset = 0 } = req.query;

    // Use Payment.findByPatient() static method with filters
    const filters = {};
    if (status) {
      filters.status = status.split(',');
    }

    const payments = await Payment.findByPatient(patientId, filters)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ capturedAt: -1 });

    // Get total count
    const total = await Payment.countDocuments({ 
      patientId, 
      ...(filters.status && { status: { $in: filters.status } })
    });

    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

    return sendSuccess(res, {
      payments: payments.map(p => p.getSummary()),
      totalAmount: totalAmount / 100,
      totalAmountRefunded: payments.reduce((sum, p) => sum + p.refundedAmount, 0) / 100,
      count: payments.length,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get patient payments error:', error.message);
    return sendError(
      res,
      'Failed to retrieve patient payments',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * ROUTE: GET /api/payments/stats
 * ============================================================
 * 
 * Get payment statistics (admin only)
 * 
 * Response:
 * {
 *   "totalProcessed": 250000,
 *   "totalRefunded": 15000,
 *   "totalPending": 5000,
 *   "successRate": 98.5,
 *   "averageAmount": 2500
 * }
 */
router.get('/stats', async (req, res) => {
  try {
    // Use Payment.getStatistics() static method
    const stats = await Payment.getStatistics();

    return sendSuccess(res, stats);

  } catch (error) {
    console.error('Get stats error:', error.message);
    return sendError(
      res,
      'Failed to retrieve statistics',
      500,
      error.message
    );
  }
});

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = router;
