const express = require("express");
const router = express.Router();
const { body, param, query, validationResult } = require("express-validator");
const { requireAuth } = require("../../auth/middleware");
const {
  signPaymentRequest,
  verifyPaymentResponse,
} = require("../security");
const Payment = require("../models/Payment");
const PaymentToken = require("../models/PaymentToken");
const PaymentAudit = require("../models/PaymentAudit");
const Invoice = require("../../models/Invoice");

/**
 * Input validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Validation error",
        details: errors.array().map(e => ({ field: e.param, message: e.msg }))
      }
    });
  }
  next();
};

/**
 * POST /api/payments/charge
 * Process payment charge with Cybersource
 * Body: { cardTokenId, invoiceRef, amount, currency }
 * Returns: { id, transactionId, status, ... }
 */
router.post(
  "/charge",
  requireAuth,
  [
    body("cardTokenId")
      .notEmpty().withMessage("Card token ID is required")
      .isMongoId().withMessage("Invalid card token ID format"),
    body("invoiceRef")
      .notEmpty().withMessage("Invoice reference is required")
      .trim()
      .isLength({ min: 3, max: 50 }).withMessage("Invoice ref must be 3-50 characters"),
    body("amount")
      .notEmpty().withMessage("Amount is required")
      .isInt({ min: 100, max: 999999 }).withMessage("Amount must be between 100 and 999999"),
    body("currency")
      .optional()
      .isIn(["USD", "LKR", "EUR", "GBP"]).withMessage("Invalid currency code")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { cardTokenId, invoiceRef, amount, currency } = req.body;
    const patientId = req.user.id;

    // Validate input
    if (!cardTokenId || !invoiceRef || !amount) {
      return res.status(400).json({
        success: false,
        error: { message: "Missing required fields" },
      });
    }

    // Get token
    const token = await PaymentToken.findById(cardTokenId);
    if (!token || !token.isActive()) {
      return res.status(400).json({
        success: false,
        error: { message: "Payment token is invalid or expired" },
      });
    }

    // Check for duplicate invoice
    const existingPayment = await Payment.findByInvoiceRef(invoiceRef);
    if (
      existingPayment &&
      ["captured", "partially_refunded", "refunded"].includes(
        existingPayment.status
      )
    ) {
      return res.status(400).json({
        success: false,
        error: { message: "Invoice already has a successful payment" },
      });
    }

    // Build Cybersource charge request
    const chargeRequest = {
      clientReferenceInformation: {
        code: invoiceRef,
      },
      processingInformation: {
        commerceIndicator: "internet",
      },
      paymentInformation: {
        tokenizedCard: {
          instrumentIdentifier: {
            id: token.cybersourceToken, // Using stored encrypted token
          },
        },
      },
      orderInformation: {
        amountDetails: {
          totalAmount: (amount / 100).toString(), // Convert to dollars
          currency: currency || "USD",
        },
      },
    };

    // Sign request with HMAC
    const signedRequest = signPaymentRequest(chargeRequest);

    // Call Cybersource API
    const CybersourceAPI = require("../CybersourceAPI");
    const response = await CybersourceAPI.makeRequest(
      "POST",
      "/pts/v2/payments",
      signedRequest
    );

    // Verify response signature
    const isValidResponse = verifyPaymentResponse(response);
    if (!isValidResponse) {
      // Log failed verification
      await PaymentAudit.create({
        paymentId: null,
        invoiceRef,
        eventType: "signature_verification_failed",
        details: {
          message: "Response signature verification failed",
        },
      });
      return res.status(400).json({
        success: false,
        error: { message: "Response verification failed" },
      });
    }

    // Create Payment record
    const payment = new Payment({
      patientId,
      invoiceRef,
      amount,
      currency: currency || "USD",
      status:
        response.decision === "ACCEPT"
          ? "captured"
          : response.decision === "DECLINE"
            ? "declined"
            : "pending_review",
      cybersourceTransactionId: response.id,
      cardLast4: token.cardLast4,
      cardBrand: token.cardBrand,
      riskScore: response.riskScore || 0,
      avsResult: response.avsResult || "N",
      cvnResult: response.cvnResult || "N",
      capturedAt:
        response.decision === "ACCEPT" ? new Date() : null,
      requiresManualReview: response.decision === "REVIEW" || (response.riskScore || 0) > 70,
    });
    await payment.save();

    // Mark token as used
    await token.markAsUsed();

    // Create audit logs
    await PaymentAudit.create({
      paymentId: payment._id,
      invoiceRef,
      eventType: "payment_initiated",
      details: { amount, decision: response.decision },
    });

    await PaymentAudit.create({
      paymentId: payment._id,
      invoiceRef,
      eventType: "signature_verified",
      details: { valid: true },
    });

    if ((response.riskScore || 0) > 70) {
      await PaymentAudit.create({
        paymentId: payment._id,
        invoiceRef,
        eventType: "fraud_suspicious",
        details: { riskScore: response.riskScore },
      });
    }

    // TODO: Send email confirmation to patient

    res.status(201).json({
      success: true,
      data: payment.getSummary(),
    });
  } catch (error) {
    console.error("Payment charge error:", error);
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to process payment",
        details: error.message,
      },
    });
  }
});

/**
 * POST /api/payments/charge/:id/refund
 * Refund a captured payment
 * Body: { amount, reason }
 * Returns: { refundId, status, refundAmount, ... }
 */
router.post(
  "/charge/:id/refund",
  requireAuth,
  [
    param("id")
      .isMongoId().withMessage("Invalid payment ID format"),
    body("amount")
      .optional()
      .isInt({ min: 1, max: 999999 }).withMessage("Refund amount must be 1-999999"),
    body("reason")
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage("Reason must be 200 characters or less")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    // Find payment
    const payment = await Payment.findById(id);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Payment not found" } });
    }

    // Verify ownership
    if (payment.patientId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: { message: "Unauthorized" } });
    }

    // Check if refundable
    const { canRefund, reason: refundReason } = payment.canBeRefunded();
    if (!canRefund) {
      return res.status(400).json({
        success: false,
        error: { message: refundReason },
      });
    }

    // Build refund request
    const refundAmount = amount || payment.amount - payment.refundedAmount;
    if (refundAmount > payment.amount - payment.refundedAmount) {
      return res.status(400).json({
        success: false,
        error: { message: "Refund amount exceeds available balance" },
      });
    }

    const refundRequest = {
      orderInformation: {
        amountDetails: {
          totalAmount: (refundAmount / 100).toString(),
          currency: payment.currency,
        },
      },
    };

    // Sign request
    const signedRequest = require("../security").signPaymentRequest(
      refundRequest
    );

    // Call Cybersource refund API
    const CybersourceAPI = require("../CybersourceAPI");
    const response = await CybersourceAPI.makeRequest(
      "POST",
      `/pts/v2/payments/${payment.cybersourceTransactionId}/refunds`,
      signedRequest
    );

    // Verify response
    const isValidResponse = require("../security").verifyPaymentResponse(
      response
    );
    if (!isValidResponse) {
      return res.status(400).json({
        success: false,
        error: { message: "Refund verification failed" },
      });
    }

    // Update payment
    payment.refundedAmount += refundAmount;
    if (payment.refundedAmount >= payment.amount) {
      payment.status = "refunded";
    } else {
      payment.status = "partially_refunded";
    }
    payment.refundsCount = (payment.refundsCount || 0) + 1;
    await payment.save();

    // Log refund
    await PaymentAudit.create({
      paymentId: payment._id,
      invoiceRef: payment.invoiceRef,
      eventType: "refund_initiated",
      details: {
        refundAmount,
        totalRefunded: payment.refundedAmount,
        reason: reason || "Customer request",
      },
    });

    // TODO: Send refund confirmation email

    res.status(202).json({
      success: true,
      data: {
        refundAmount,
        totalRefunded: payment.refundedAmount,
        status: payment.status,
      },
    });
  } catch (error) {
    console.error("Refund error:", error);
    res.status(500).json({
      success: false,
      error: { message: "Failed to process refund" },
    });
  }
});

/**
 * GET /api/payments/charge/:id
 * Get payment details
 */
router.get(
  "/charge/:id",
  requireAuth,
  [
    param("id")
      .isMongoId().withMessage("Invalid payment ID format")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id);

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Payment not found" } });
    }

    if (payment.patientId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: { message: "Unauthorized" } });
    }

    res.json({ success: true, data: payment.getSummary() });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        error: { message: "Failed to retrieve payment" },
      });
  }
});

/**
 * GET /api/payments/invoice/:invoiceRef
 * Get payment by invoice reference
 */
router.get(
  "/invoice/:invoiceRef",
  [
    param("invoiceRef")
      .notEmpty().withMessage("Invoice reference is required")
      .trim()
      .isLength({ min: 3, max: 50 }).withMessage("Invoice ref must be 3-50 characters")
      .matches(/^[A-Z0-9\-]+$/).withMessage("Invoice must be alphanumeric with dashes")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { invoiceRef } = req.params;
    const payment = await Payment.findByInvoiceRef(invoiceRef);

    if (!payment) {
      return res.status(200).json({
        success: true,
        data: {
          isPaid: false,
          invoiceRef,
        },
      });
    }

    res.json({
      success: true,
      data: {
        isPaid: ["captured", "partially_refunded", "refunded"].includes(
          payment.status
        ),
        amount: payment.amount,
        status: payment.status,
        cardLast4: payment.cardLast4,
        refundedAmount: payment.refundedAmount || 0,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        error: { message: "Failed to retrieve payment" },
      });
  }
});

/**
 * GET /api/payments/patient/:patientId
 * List payments for a patient
 */
router.get(
  "/patient/:patientId",
  requireAuth,
  [
    param("patientId")
      .isMongoId().withMessage("Invalid patient ID format"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage("Limit must be 1-100"),
    query("offset")
      .optional()
      .isInt({ min: 0 }).withMessage("Offset must be non-negative"),
    query("status")
      .optional()
      .trim()
      .matches(/^[a-z_,]+$/).withMessage("Invalid status format")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 10, offset = 0, status } = req.query;

    if (patientId !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: { message: "Unauthorized" } });
    }

    const filter = { patientId };
    if (status) {
      filter.status = { $in: status.split(",") };
    }

    const payments = await Payment.find(filter)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 });

    const total = await Payment.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payments: payments.map((p) => p.getSummary()),
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        error: { message: "Failed to retrieve payments" },
      });
  }
});

/**
 * GET /api/payments/stats
 * Get payment statistics
 */
router.get(
  "/stats",
  [], // No parameters to validate
  handleValidationErrors,
  async (req, res) => {
  try {
    const stats = await Payment.getStatistics();
    res.json({ success: true, data: stats });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        error: { message: "Failed to retrieve statistics" },
      });
  }
});

module.exports = router;
