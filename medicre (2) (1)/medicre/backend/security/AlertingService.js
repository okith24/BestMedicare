/**
 * Security Alerting Service
 * Monitors suspicious activities and sends alerts via Email and Slack
 */

const nodemailer = require("nodemailer");
const axios = require("axios");
const PaymentAudit = require("../payments/models/PaymentAudit");
const logger = require("../config/logger");

/**
 * Configure email transporter
 */
let emailTransporter;
try {
  emailTransporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
} catch (error) {
  logger.warn("Email service not configured, alerts will be limited");
}

/**
 * Alert severity levels
 */
const ALERT_LEVELS = {
  LOW: "🟡 LOW",
  MEDIUM: "🟠 MEDIUM",
  HIGH: "🔴 HIGH",
  CRITICAL: "🔴🔴 CRITICAL",
};

/**
 * Alert types and thresholds
 */
const ALERTS = {
  FAILED_LOGIN_THRESHOLD: {
    threshold: parseInt(process.env.FAILED_LOGIN_THRESHOLD || "5"),
    window: 15, // minutes
    severity: "HIGH",
    description: "Multiple failed login attempts",
  },
  HIGH_VALUE_PAYMENT: {
    threshold: parseInt(process.env.HIGH_VALUE_PAYMENT_THRESHOLD || "500000"), // LKR
    severity: "MEDIUM",
    description: "High-value payment transaction",
  },
  SUSPICIOUS_PAYMENT_PATTERN: {
    threshold: parseInt(process.env.SUSPICIOUS_PATTERN_THRESHOLD || "10"), // attempts
    window: 60, // minutes
    severity: "HIGH",
    description: "Suspicious payment pattern detected",
  },
  ADMIN_ACTION: {
    severity: "MEDIUM",
    description: "System administrator action performed",
  },
  DATA_ACCESS_HIGH_VOLUME: {
    threshold: parseInt(process.env.DATA_ACCESS_THRESHOLD || "100"), // requests
    window: 10, // minutes
    severity: "HIGH",
    description: "Unusual high-volume data access",
  },
};

/**
 * Send email alert
 * @param {string} subject - Alert subject
 * @param {object} details - Alert details
 * @param {string} severity - Alert severity level
 */
async function sendEmailAlert(subject, details, severity = "HIGH") {
  if (!emailTransporter || !process.env.ADMIN_ALERT_EMAILS) {
    logger.warn("Email alerting not configured");
    return;
  }

  try {
    const recipients = process.env.ADMIN_ALERT_EMAILS.split(",").map((e) =>
      e.trim()
    );

    const htmlContent = `
      <h2>${ALERT_LEVELS[severity]} Security Alert</h2>
      <h3>${subject}</h3>
      <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      <hr>
      <h4>Details:</h4>
      <pre>${JSON.stringify(details, null, 2)}</pre>
      <hr>
      <p>
        <a href="${process.env.FRONTEND_ORIGIN}/admin/security-dashboard">
          View Security Dashboard
        </a>
      </p>
    `;

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipients.join(","),
      subject: `[${ALERT_LEVELS[severity]}] ${subject}`,
      html: htmlContent,
    });

    logger.info(`Security alert email sent: ${subject}`);
  } catch (error) {
    logger.error(`Failed to send email alert: ${error.message}`);
  }
}

/**
 * Send Slack alert
 * @param {string} subject - Alert subject
 * @param {object} details - Alert details
 * @param {string} severity - Alert severity level
 */
async function sendSlackAlert(subject, details, severity = "HIGH") {
  if (!process.env.SLACK_WEBHOOK_URL) {
    logger.debug("Slack webhook not configured");
    return;
  }

  try {
    const colorMap = {
      LOW: "#FFA500",
      MEDIUM: "#FF6600",
      HIGH: "#DD0000",
      CRITICAL: "#FF0000",
    };

    const payload = {
      text: `🚨 ${subject}`,
      attachments: [
        {
          color: colorMap[severity] || "#FF0000",
          title: subject,
          text: JSON.stringify(details, null, 2),
          ts: Math.floor(Date.now() / 1000),
          footer: "Security Alerting System",
        },
      ],
    };

    await axios.post(process.env.SLACK_WEBHOOK_URL, payload);
    logger.info(`Security alert sent to Slack: ${subject}`);
  } catch (error) {
    logger.error(`Failed to send Slack alert: ${error.message}`);
  }
}

/**
 * Check for failed login attempts (brute force detection)
 * @param {string} email - User email
 * @returns {Promise<{alert: boolean, count: number}>}
 */
async function checkFailedLogins(email) {
  try {
    const threshold = ALERTS.FAILED_LOGIN_THRESHOLD.threshold;
    const windowMinutes = ALERTS.FAILED_LOGIN_THRESHOLD.window;
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    const failedAttempts = await PaymentAudit.countDocuments({
      action: "LOGIN_FAILED",
      email,
      createdAt: { $gte: cutoffTime },
    });

    if (failedAttempts >= threshold) {
      await sendEmailAlert(`Brute Force Attack Detected - ${email}`, {
        email,
        failedAttempts,
        threshold,
        timeWindow: `${windowMinutes} minutes`,
        accountLocked: true,
      }, "CRITICAL");

      await sendSlackAlert(`🔓 Brute Force Attack: ${email}`, {
        email,
        failedAttempts,
        recommendedAction: "Review account and consider IP blacklist",
      }, "CRITICAL");

      return {
        alert: true,
        count: failedAttempts,
        shouldLockAccount: true,
      };
    }

    return {
      alert: false,
      count: failedAttempts,
    };
  } catch (error) {
    logger.error(`Error checking failed logins: ${error.message}`);
    return { alert: false, count: 0 };
  }
}

/**
 * Check for high-value payments
 * @param {number} amount - Payment amount
 * @param {string} patientId - Patient ID
 * @returns {Promise<boolean>}
 */
async function checkHighValuePayment(amount, patientId = null) {
  try {
    const threshold = ALERTS.HIGH_VALUE_PAYMENT.threshold;

    if (amount >= threshold) {
      await sendEmailAlert(`High-Value Payment Detection`, {
        amount,
        threshold,
        exceededBy: amount - threshold,
        currency: process.env.PAYMENT_CURRENCY || "LKR",
        patientId: patientId || "Unknown",
        timestamp: new Date().toISOString(),
      }, "MEDIUM");

      await sendSlackAlert(`💰 High-Value Payment`, {
        amount,
        threshold,
        patientId,
        recommendedAction: "Manual review recommended",
      }, "MEDIUM");

      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error checking high-value payment: ${error.message}`);
    return false;
  }
}

/**
 * Check for suspicious payment patterns
 * @param {string} cardToken - Cardholder token/ID
 * @returns {Promise<{suspicious: boolean, attempts: number}>}
 */
async function checkSuspiciousPaymentPattern(cardToken) {
  try {
    const threshold = ALERTS.SUSPICIOUS_PAYMENT_PATTERN.threshold;
    const windowMinutes = ALERTS.SUSPICIOUS_PAYMENT_PATTERN.window;
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Check for multiple failed payments with same card
    const failedPayments = await PaymentAudit.countDocuments({
      action: "PAYMENT_FAILED",
      "details.cardToken": cardToken,
      createdAt: { $gte: cutoffTime },
    });

    if (failedPayments >= threshold) {
      await sendEmailAlert(`Suspicious Payment Pattern Detected`, {
        cardToken: cardToken.substring(0, 8) + "****",
        failedAttempts: failedPayments,
        threshold,
        timeWindow: `${windowMinutes} minutes`,
        recommendation: "Card may be compromised - consider blocking",
      }, "HIGH");

      await sendSlackAlert(`⚠️ Suspicious Payment Pattern`, {
        cardToken: cardToken.substring(0, 8) + "****",
        failedAttempts: failedPayments,
        recommendedAction:
          "Review transaction history and flag card for manual verification",
      }, "HIGH");

      return {
        suspicious: true,
        attempts: failedPayments,
        shouldBlockCard: true,
      };
    }

    return {
      suspicious: false,
      attempts: failedPayments,
    };
  } catch (error) {
    logger.error(`Error checking payment patterns: ${error.message}`);
    return { suspicious: false, attempts: 0 };
  }
}

/**
 * Alert on administrative actions
 * @param {string} adminEmail - Admin email
 * @param {string} action - Action performed
 * @param {object} details - Action details
 */
async function alertAdminAction(adminEmail, action, details) {
  try {
    const sensitivActions = [
      "USER_DELETION",
      "PERMISSION_CHANGE",
      "SYSTEM_CONFIG_CHANGE",
      "DATA_EXPORT",
      "MANUAL_REFUND",
      "ACCOUNT_UNLOCK",
    ];

    if (sensitivActions.includes(action)) {
      await sendEmailAlert(`Admin Action: ${action}`, {
        adminEmail,
        action,
        details,
        timestamp: new Date().toISOString(),
      }, "MEDIUM");

      logger.info(`Security alert: Admin action ${action} by ${adminEmail}`);
    }
  } catch (error) {
    logger.error(`Error alerting admin action: ${error.message}`);
  }
}

/**
 * Check for unusual data access patterns
 * @param {string} userId - User ID
 * @returns {Promise<{unusual: boolean, requestCount: number}>}
 */
async function checkUnusualDataAccess(userId) {
  try {
    const threshold = ALERTS.DATA_ACCESS_HIGH_VOLUME.threshold;
    const windowMinutes = ALERTS.DATA_ACCESS_HIGH_VOLUME.window;
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    const requestCount = await PaymentAudit.countDocuments({
      userId,
      action: { $in: ["DATA_ACCESS", "PAYMENT_VIEW", "REPORT_EXPORT"] },
      createdAt: { $gte: cutoffTime },
    });

    if (requestCount >= threshold) {
      await sendEmailAlert(`Unusual Data Access Detected`, {
        userId,
        requestCount,
        threshold,
        timeWindow: `${windowMinutes} minutes`,
        recommendation: "Review user activity and consider access suspension",
      }, "HIGH");

      await sendSlackAlert(`🔍 Unusual Data Access`, {
        userId,
        requestCount,
        recommendedAction: "Potential data exfiltration - manual review advised",
      }, "HIGH");

      return {
        unusual: true,
        requestCount,
        shouldSuspendAccess: true,
      };
    }

    return {
      unusual: false,
      requestCount,
    };
  } catch (error) {
    logger.error(`Error checking data access: ${error.message}`);
    return { unusual: false, requestCount: 0 };
  }
}

/**
 * Test alert system (for administrative purposes)
 */
async function sendTestAlert() {
  try {
    await sendEmailAlert("Test Security Alert", {
      testType: "System Configuration Test",
      timestamp: new Date().toISOString(),
      message: "If you received this email, security alerting is working correctly",
    }, "MEDIUM");

    await sendSlackAlert("Test Alert", {
      message: "Security alerting system is functional",
    }, "MEDIUM");

    logger.info("Test alert sent successfully");
    return { success: true };
  } catch (error) {
    logger.error(`Test alert failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmailAlert,
  sendSlackAlert,
  checkFailedLogins,
  checkHighValuePayment,
  checkSuspiciousPaymentPattern,
  alertAdminAction,
  checkUnusualDataAccess,
  sendTestAlert,
  ALERTS,
  ALERT_LEVELS,
};
