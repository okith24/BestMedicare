/**
 * Data Retention Management Routes
 * Admin only - manage data retention policies and manual cleanup
 */

const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../auth/middleware");
const {
  generateRetentionReport,
  anonymizePatientData,
} = require("./DataRetentionPolicy");
const {
  runDataRetentionCleanup,
  getSchedulerStatus,
} = require("./DataRetentionScheduler");
const PaymentAudit = require("../payments/models/PaymentAudit");
const logger = require("../config/logger");

/**
 * GET /api/data-retention/report
 * Get data retention report (what will be deleted/archived)
 * Admin only
 */
router.get("/report", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { report, error } = await generateRetentionReport();

    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error },
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error(`Error getting retention report: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to generate report" },
    });
  }
});

/**
 * POST /api/data-retention/cleanup
 * Manually trigger data retention cleanup
 * Admin only - use with caution
 */
router.post("/cleanup", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Log the admin action
    await PaymentAudit.create({
      action: "MANUAL_DATA_RETENTION_CLEANUP",
      adminId: req.user.id,
      adminEmail: req.user.email,
      details: {
        triggeredBy: req.user.email,
        timestamp: new Date(),
      },
      severity: "HIGH",
    });

    const result = await runDataRetentionCleanup();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error running manual cleanup: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to run cleanup" },
    });
  }
});

/**
 * POST /api/data-retention/anonymize/:patientId
 * Anonymize patient data (GDPR/CCPA right to be forgotten)
 * Admin only
 */
router.post(
  "/anonymize/:patientId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { patientId } = req.params;

      // Log the sensitive action
      await PaymentAudit.create({
        action: "PATIENT_DATA_ANONYMIZATION",
        adminId: req.user.id,
        adminEmail: req.user.email,
        patientId,
        details: {
          reason: req.body.reason || "No reason provided",
          triggeredBy: req.user.email,
        },
        severity: "CRITICAL",
      });

      const { success, error } = await anonymizePatientData(patientId);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: { message: error },
        });
      }

      res.json({
        success: true,
        message: `Patient ${patientId} data has been anonymized`,
      });
    } catch (error) {
      logger.error(`Error anonymizing patient data: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to anonymize data" },
      });
    }
  }
);

/**
 * GET /api/data-retention/scheduler/status
 * Get scheduler status
 * Admin only
 */
router.get(
  "/scheduler/status",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const status = getSchedulerStatus();
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error(`Error getting scheduler status: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to get scheduler status" },
      });
    }
  }
);

/**
 * GET /api/data-retention/audit-logs
 * View deleted/anonymized records (audit trail)
 * Admin only
 */
router.get(
  "/audit-logs",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { limit = 50, offset = 0, action } = req.query;

      const filter = {
        action: {
          $in: [
            "MANUAL_DATA_RETENTION_CLEANUP",
            "PATIENT_DATA_ANONYMIZATION",
          ],
        },
      };

      if (action) {
        filter.action = action;
      }

      const logs = await PaymentAudit.find(filter)
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .sort({ createdAt: -1 });

      const total = await PaymentAudit.countDocuments(filter);

      res.json({
        success: true,
        data: {
          logs,
          total,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error(`Error retrieving audit logs: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to retrieve audit logs" },
      });
    }
  }
);

module.exports = router;
