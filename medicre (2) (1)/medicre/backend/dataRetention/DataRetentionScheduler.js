/**
 * Data Retention Scheduler
 * Schedules automatic cleanup jobs for data retention policies
 * Runs daily at 2:00 AM (configurable)
 */

const cron = require("node-cron");
const {
  deleteOldAuditLogs,
  archiveOldPatientRecords,
  deleteOldInvoices,
  generateRetentionReport,
} = require("./DataRetentionPolicy");
const logger = require("../config/logger");

let scheduledJobs = [];
let isSchedulerRunning = false;

/**
 * Start the data retention scheduler
 * Runs cleanup jobs on a schedule
 */
function startScheduler() {
  if (isSchedulerRunning) {
    logger.warn("Data Retention Scheduler is already running");
    return;
  }

  // Get schedule from environment (default: 2:00 AM daily)
  // Format: "0 2 * * *" (cron syntax)
  const scheduleTime = process.env.DATA_RETENTION_SCHEDULE || "0 2 * * *";

  try {
    // Main cleanup job - runs daily
    const mainJob = cron.schedule(scheduleTime, async () => {
      await runDataRetentionCleanup();
    });

    // Weekly retention report - runs every Sunday at 3:00 AM
    const reportJob = cron.schedule("0 3 * * 0", async () => {
      await generateAndLogRetentionReport();
    });

    scheduledJobs.push(mainJob, reportJob);
    isSchedulerRunning = true;

    logger.info(`Data Retention Scheduler started - Cleanup at ${scheduleTime}`);
  } catch (error) {
    logger.error(`Failed to start Data Retention Scheduler: ${error.message}`);
  }
}

/**
 * Stop the data retention scheduler
 */
function stopScheduler() {
  if (!isSchedulerRunning) {
    logger.warn("Data Retention Scheduler is not running");
    return;
  }

  scheduledJobs.forEach((job) => {
    job.stop();
    job.destroy();
  });

  scheduledJobs = [];
  isSchedulerRunning = false;

  logger.info("Data Retention Scheduler stopped");
}

/**
 * Run data retention cleanup immediately
 * Called by scheduler or manually for testing
 */
async function runDataRetentionCleanup() {
  const startTime = new Date();
  logger.info("=== Starting Data Retention Cleanup ===");

  try {
    // Run all cleanup operations
    const [auditResult, patientResult, invoiceResult] = await Promise.all([
      deleteOldAuditLogs(),
      archiveOldPatientRecords(),
      deleteOldInvoices(),
    ]);

    // Log results
    const duration = new Date() - startTime;
    const summary = {
      auditLogs: {
        deleted: auditResult.deleted,
        error: auditResult.error,
      },
      patientRecords: {
        archived: patientResult.archived,
        error: patientResult.error,
      },
      invoices: {
        deleted: invoiceResult.deleted,
        error: invoiceResult.error,
      },
      completedAt: new Date(),
      durationMs: duration,
      success: !auditResult.error && !patientResult.error && !invoiceResult.error,
    };

    logger.info(`=== Data Retention Cleanup Completed (${duration}ms) ===`);
    logger.info(JSON.stringify(summary, null, 2));

    return summary;
  } catch (error) {
    logger.error(`Data Retention Cleanup Failed: ${error.message}`);
    return {
      error: error.message,
      success: false,
    };
  }
}

/**
 * Generate and log retention report
 */
async function generateAndLogRetentionReport() {
  try {
    const { report, error } = await generateRetentionReport();

    if (error) {
      logger.error(`Failed to generate retention report: ${error}`);
      return;
    }

    logger.info("=== Weekly Data Retention Report ===");
    logger.info(JSON.stringify(report, null, 2));
  } catch (error) {
    logger.error(`Error generating retention report: ${error.message}`);
  }
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    isRunning: isSchedulerRunning,
    jobsCount: scheduledJobs.length,
    scheduleTime: process.env.DATA_RETENTION_SCHEDULE || "0 2 * * *",
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  runDataRetentionCleanup,
  generateAndLogRetentionReport,
  getSchedulerStatus,
};
