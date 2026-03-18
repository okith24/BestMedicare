const crypto = require("crypto");
const PaymentAudit = require("./models/PaymentAudit");

/**
 * Verify webhook signature from Cybersource
 * Uses HMAC-SHA256 to prevent spoofed notifications
 */
function verifyWebhookSignature(rawBody, signature, secretKey) {
  try {
    if (!secretKey) {
      console.warn("Webhook secret key not configured");
      return false;
    }

    // Create expected signature
    const hmac = crypto.createHmac("sha256", secretKey);
    hmac.update(rawBody, "utf-8");
    const expectedSignature = hmac.digest("base64");

    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("Webhook signature verification error:", error);
    return false;
  }
}

/**
 * Parse Cybersource webhook notification
 * Extracts relevant payment information from notification
 */
function parseWebhookNotification(body) {
  try {
    // Cybersource sends notification in nested structure
    const notification = {
      id: body.id || body.transactionId,
      merchantReferenceCode: body.merchantReferenceCode || body.orderInformation?.commerceIndicator,
      decision: body.processingInformation?.status || body.decision || "ERROR",
      riskScore: body.riskInformation?.totalRiskScore || 0,
      avsResult: body.paymentInformation?.avsResponse?.code || "N",
      cvnResult: body.paymentInformation?.cvnResponse?.code || "N",
      amount: body.orderInformation?.amountDetails?.totalAmount,
      currency: body.orderInformation?.amountDetails?.currency,
      timestamp: body.timestamp || new Date().toISOString(),
    };

    if (!notification.id || !notification.merchantReferenceCode) {
      console.warn("Invalid notification structure", body);
      return null;
    }

    return notification;
  } catch (error) {
    console.error("Failed to parse webhook notification:", error);
    return null;
  }
}

/**
 * Create idempotency key from notification
 * Prevents duplicate processing if webhook is retried
 */
function createIdempotencyKey(notification) {
  const key = `${notification.id}_${notification.merchantReferenceCode}_${Math.floor(new Date(notification.timestamp).getTime() / 1000)}`;
  const hash = crypto
    .createHash("sha256")
    .update(key)
    .digest("hex");
  return hash;
}

/**
 * Check if state transition is valid
 * Defines allowed payment status flows
 */
function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    pending: ["captured", "declined", "pending_review", "error"],
    pending_review: ["captured", "declined", "error"],
    captured: ["partially_refunded", "refunded"],
    partially_refunded: ["refunded"],
    declined: [], // No transitions from declined
    refunded: [], // No transitions from refunded
    error: ["pending"], // Can retry from error
  };

  if (!validTransitions[currentStatus]) {
    return false;
  }

  return validTransitions[currentStatus].includes(newStatus);
}

/**
 * Map Cybersource decision to payment status
 */
function getPaymentStatusFromDecision(decision) {
  const statusMap = {
    ACCEPT: "captured",
    DECLINE: "declined",
    REVIEW: "pending_review",
    ERROR: "error",
  };

  return statusMap[decision] || "error";
}

/**
 * Determine if admin should be alerted
 * Alert on high-risk or manual review cases
 */
function shouldAlertAdmin(notification) {
  const riskScore = notification.riskScore || 0;
  const decision = notification.decision || "ERROR";

  // Alert if: high risk score, manual review required, or error
  return riskScore > 70 || decision === "REVIEW" || decision === "ERROR";
}

/**
 * Create webhook audit log entry
 */
async function createWebhookAuditLog(paymentId, notification, idempotencyKey) {
  try {
    await PaymentAudit.create({
      paymentId,
      invoiceRef: notification.merchantReferenceCode,
      eventType: "webhook_processed",
      idempotencyKey,
      details: {
        cybersourceTransactionId: notification.id,
        decision: notification.decision,
        riskScore: notification.riskScore,
        avsResult: notification.avsResult,
        cvnResult: notification.cvnResult,
        amount: notification.amount,
        currency: notification.currency,
      },
    });
  } catch (error) {
    console.error("Failed to create webhook audit log:", error);
  }
}

module.exports = {
  verifyWebhookSignature,
  parseWebhookNotification,
  createIdempotencyKey,
  isValidStatusTransition,
  getPaymentStatusFromDecision,
  shouldAlertAdmin,
  createWebhookAuditLog,
};
