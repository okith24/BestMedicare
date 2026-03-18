/**
 * Security Alerting Management Routes
 * Admin only - configure alerts and test alerting system
 */

const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../auth/middleware");
const {
  sendEmailAlert,
  sendSlackAlert,
  sendTestAlert,
  checkFailedLogins,
  checkHighValuePayment,
  ALERTS,
} = require("./AlertingService");
const PaymentAudit = require("../payments/models/PaymentAudit");
const logger = require("../config/logger");

/**
 * GET /api/security/alerts/config
 * Get current alert configuration
 * Admin only
 */
router.get("/config", requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = {
      emailConfigured: !!process.env.EMAIL_USER,
      slackConfigured: !!process.env.SLACK_WEBHOOK_URL,
      adminEmails: process.env.ADMIN_ALERT_EMAILS,
      alerts: Object.entries(ALERTS).map(([key, value]) => ({
        type: key,
        threshold: value.threshold || "N/A",
        severity: value.severity,
        description: value.description,
        enabled: true,
      })),
    };

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    logger.error(`Error getting alert config: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to get alert configuration" },
    });
  }
});

/**
 * POST /api/security/alerts/test
 * Send test alert to email and Slack
 * Admin only
 */
router.post("/test", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await sendTestAlert();

    // Log the test alert action
    await PaymentAudit.create({
      action: "TEST_SECURITY_ALERT_SENT",
      adminId: req.user.id,
      adminEmail: req.user.email,
      details: {
        result,
        timestamp: new Date(),
      },
      severity: "MEDIUM",
    });

    res.json({
      success: result.success,
      message: result.success
        ? "Test alert sent successfully"
        : "Failed to send test alert",
      details: result,
    });
  } catch (error) {
    logger.error(`Error sending test alert: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to send test alert" },
    });
  }
});

/**
 * GET /api/security/alerts/recent
 * Get recent security alerts (from audit log)
 * Admin only
 */
router.get("/recent", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, type } = req.query;

    const filter = {
      action: {
        $in: [
          "LOGIN_FAILED",
          "HIGH_VALUE_PAYMENT",
          "SUSPICIOUS_PAYMENT_PATTERN",
          "UNUSUAL_DATA_ACCESS",
        ],
      },
    };

    if (type) {
      filter.action = type;
    }

    const alerts = await PaymentAudit.find(filter)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 });

    const total = await PaymentAudit.countDocuments(filter);

    res.json({
      success: true,
      data: {
        alerts,
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error(`Error retrieving alerts: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to retrieve alerts" },
    });
  }
});

/**
 * GET /api/security/alerts/failed-logins/:email
 * Check failed login attempts for specific email
 * Admin only
 */
router.get(
  "/failed-logins/:email",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { email } = req.params;
      const result = await checkFailedLogins(email);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`Error checking failed logins: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to check failed logins" },
      });
    }
  }
);

/**
 * POST /api/security/alerts/custom
 * Send custom security alert
 * Admin only - for custom notifications
 */
router.post(
  "/custom",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { subject, details, severity = "MEDIUM", channels = ["email", "slack"] } = req.body;

      if (!subject || !details) {
        return res.status(400).json({
          success: false,
          error: { message: "Subject and details are required" },
        });
      }

      // Send via enabled channels
      if (channels.includes("email")) {
        await sendEmailAlert(subject, details, severity);
      }

      if (channels.includes("slack")) {
        await sendSlackAlert(subject, details, severity);
      }

      // Log the custom alert
      await PaymentAudit.create({
        action: "CUSTOM_SECURITY_ALERT",
        adminId: req.user.id,
        adminEmail: req.user.email,
        details: {
          subject,
          details,
          severity,
          channels,
        },
        severity: "MEDIUM",
      });

      res.json({
        success: true,
        message: "Custom alert sent",
      });
    } catch (error) {
      logger.error(`Error sending custom alert: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to send custom alert" },
      });
    }
  }
);

/**
 * GET /api/security/alerts/statistics
 * Get alert statistics (count by type, severity distribution)
 * Admin only
 */
router.get(
  "/statistics",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const days = parseInt(req.query.days || "7");
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const alertTypes = await PaymentAudit.aggregate([
        {
          $match: {
            action: {
              $in: [
                "LOGIN_FAILED",
                "HIGH_VALUE_PAYMENT",
                "SUSPICIOUS_PAYMENT_PATTERN",
                "UNUSUAL_DATA_ACCESS",
              ],
            },
            createdAt: { $gte: cutoffDate },
          },
        },
        {
          $group: {
            _id: "$action",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      const severityDistribution = await PaymentAudit.aggregate([
        {
          $match: {
            action: {
              $in: [
                "LOGIN_FAILED",
                "HIGH_VALUE_PAYMENT",
                "SUSPICIOUS_PAYMENT_PATTERN",
                "UNUSUAL_DATA_ACCESS",
              ],
            },
            createdAt: { $gte: cutoffDate },
          },
        },
        {
          $group: {
            _id: "$severity",
            count: { $sum: 1 },
          },
        },
      ]);

      const dailyTrend = await PaymentAudit.aggregate([
        {
          $match: {
            action: {
              $in: [
                "LOGIN_FAILED",
                "HIGH_VALUE_PAYMENT",
                "SUSPICIOUS_PAYMENT_PATTERN",
                "UNUSUAL_DATA_ACCESS",
              ],
            },
            createdAt: { $gte: cutoffDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        success: true,
        data: {
          period: `${days} days`,
          alertTypes,
          severityDistribution,
          dailyTrend,
          totalAlerts: alertTypes.reduce((sum, item) => sum + item.count, 0),
        },
      });
    } catch (error) {
      logger.error(`Error getting alert statistics: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to get alert statistics" },
      });
    }
  }
);

module.exports = router;
