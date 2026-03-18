const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const PaymentAudit = require("../models/PaymentAudit");
const {
  verifyWebhookSignature,
  parseWebhookNotification,
  createIdempotencyKey,
  isValidStatusTransition,
  getPaymentStatusFromDecision,
  shouldAlertAdmin,
  createWebhookAuditLog,
} = require("../webhookHandler");

/**
 * POST /api/payments/webhooks/cybersource
 * Receive Cybersource payment notifications (webhooks)
 * 
 * Critical: Always return 200 OK to Cybersource (prevents retry storms)
 * - Even on signature verification failure
 * - Even if payment not found
 * - Only return non-200 for JSON parse errors
 */
router.post("/cybersource", async (req, res) => {
  try {
    // Get raw body and signature
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers["x-cybersource-signature"];

    if (!signature) {
      console.warn("Webhook received without signature");
      return res.status(400).json({
        success: false,
        error: { message: "Missing signature" },
      });
    }

    // Verify webhook signature
    const webhookSecret = process.env.CYBERSOURCE_WEBHOOK_SECRET;
    const isValidSignature = verifyWebhookSignature(
      rawBody,
      signature,
      webhookSecret
    );

    if (!isValidSignature) {
      console.warn("Webhook signature verification failed");
      return res.status(400).json({
        success: false,
        error: { message: "Invalid signature" },
      });
    }

    // Parse notification
    const notification = parseWebhookNotification(req.body);
    if (!notification) {
      console.warn("Failed to parse webhook notification");
      return res.status(400).json({
        success: false,
        error: { message: "Failed to parse notification" },
      });
    }

    // Create idempotency key
    const idempotencyKey = createIdempotencyKey(notification);

    // Check for duplicate processing
    const existingAudit = await PaymentAudit.findOne({
      idempotencyKey,
    });

    if (existingAudit) {
      console.log(`Webhook already processed: ${idempotencyKey}`);
      // Already processed, return 200 (Cybersource won't retry)
      return res.status(200).json({
        success: true,
        message: "Webhook already processed",
      });
    }

    // Find payment by invoice reference
    const payment = await Payment.findByInvoiceRef(
      notification.merchantReferenceCode
    );

    if (!payment) {
      console.warn(
        `Payment not found for invoice: ${notification.merchantReferenceCode}`
      );
      // Create audit log for missing payment
      await PaymentAudit.create({
        paymentId: null,
        invoiceRef: notification.merchantReferenceCode,
        eventType: "webhook_received",
        idempotencyKey,
        details: {
          message: "Payment not found",
          decision: notification.decision,
          cybersourceTransactionId: notification.id,
        },
      });
      // Return 200 (can't process but tell Cybersource we got it)
      return res.status(200).json({
        success: true,
        message: "Webhook received but payment not found",
      });
    }

    // Get new status from decision
    const newStatus = getPaymentStatusFromDecision(notification.decision);

    // Validate state transition
    const isValidTransition = isValidStatusTransition(
      payment.status,
      newStatus
    );

    if (!isValidTransition) {
      console.warn(
        `Invalid state transition: ${payment.status} → ${newStatus}`
      );
      // Can't process but don't retry
      return res.status(200).json({
        success: true,
        message: "Invalid state transition",
      });
    }

    // Update payment
    payment.status = newStatus;
    payment.cybersourceTransactionId =
      notification.id || payment.cybersourceTransactionId;
    payment.riskScore = notification.riskScore || 0;
    payment.avsResult = notification.avsResult || "N";
    payment.cvnResult = notification.cvnResult || "N";

    if (newStatus === "captured") {
      payment.capturedAt = new Date();
    }

    // Check if requires manual review
    if (notification.decision === "REVIEW" || payment.riskScore > 70) {
      payment.requiresManualReview = true;
    }

    await payment.save();

    // Create webhook audit log
    await createWebhookAuditLog(
      payment._id,
      notification,
      idempotencyKey
    );

    // Check if should alert admin
    const shouldAlert = shouldAlertAdmin(notification);
    if (shouldAlert) {
      // Create fraud alert
      await PaymentAudit.create({
        paymentId: payment._id,
        invoiceRef: payment.invoiceRef,
        eventType: "fraud_suspicious",
        details: {
          riskScore: notification.riskScore,
          decision: notification.decision,
          requiresManualReview: true,
        },
      });

      // TODO: Send email alert to admin
      console.log(
        `Admin alert created for payment ${payment._id} - Risk: ${notification.riskScore}`
      );
    }

    // Return 200 OK (critical!)
    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      data: {
        paymentId: payment._id,
        status: payment.status,
        processed: true,
      },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Even on error, return 200 to prevent Cybersource retries
    res.status(200).json({
      success: false,
      error: {
        message: "Internal webhook processing error",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  }
});

module.exports = router;
