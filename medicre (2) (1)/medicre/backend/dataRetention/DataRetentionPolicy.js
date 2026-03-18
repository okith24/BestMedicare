/**
 * Data Retention Policy Module
 * Manages automatic cleanup of old data to comply with data minimization laws
 */

const PaymentAudit = require("../payments/models/PaymentAudit");
const Patient = require("../models/Patient");
const Invoice = require("../models/Invoice");
const logger = require("../config/logger");

/**
 * Configuration for data retention periods (in days)
 */
const RETENTION_POLICIES = {
  // Audit logs: Delete after 365+ days (1 year default, configurable)
  auditLogs: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "365"),
  
  // Patient records: Archive after 7+ years (HIPAA requirement in US)
  patientRecords: parseInt(process.env.PATIENT_RECORD_RETENTION_DAYS || "2555"), // 7 years
  
  // Invoices: Keep for minimum 7 years for tax/legal purposes
  invoices: parseInt(process.env.INVOICE_RETENTION_DAYS || "2555"),
  
  // Failed login attempts: Delete after 90 days
  failedLogins: parseInt(process.env.FAILED_LOGIN_RETENTION_DAYS || "90"),
  
  // Session data: Delete after 30 days of inactivity
  sessions: parseInt(process.env.SESSION_RETENTION_DAYS || "30"),
};

/**
 * Delete audit logs older than retention period
 * @returns {Promise<{deleted: number, error: string|null}>}
 */
async function deleteOldAuditLogs() {
  try {
    const retentionDays = RETENTION_POLICIES.auditLogs;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await PaymentAudit.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    logger.info(`Data Retention: Deleted ${result.deletedCount} audit logs older than ${retentionDays} days`);
    
    return {
      deleted: result.deletedCount,
      error: null,
    };
  } catch (error) {
    logger.error(`Data Retention Error: Failed to delete old audit logs - ${error.message}`);
    return {
      deleted: 0,
      error: error.message,
    };
  }
}

/**
 * Archive old patient records (mark as archived, not deleted)
 * Keeps records for legal/audit purposes but marks them as archived
 * @returns {Promise<{archived: number, error: string|null}>}
 */
async function archiveOldPatientRecords() {
  try {
    const retentionDays = RETENTION_POLICIES.patientRecords;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Only archive inactive patients (no activity for retention period)
    const result = await Patient.updateMany(
      {
        lastActivityAt: { $lt: cutoffDate },
        isArchived: { $ne: true },
      },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date(),
          archivedReason: "Automatic archival - retention policy",
        },
      }
    );

    logger.info(`Data Retention: Archived ${result.modifiedCount} patient records inactive for ${retentionDays} days`);
    
    return {
      archived: result.modifiedCount,
      error: null,
    };
  } catch (error) {
    logger.error(`Data Retention Error: Failed to archive patient records - ${error.message}`);
    return {
      archived: 0,
      error: error.message,
    };
  }
}

/**
 * Delete old invoice records (after legal retention period)
 * @returns {Promise<{deleted: number, error: string|null}>}
 */
async function deleteOldInvoices() {
  try {
    const retentionDays = RETENTION_POLICIES.invoices;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Only delete fully paid/refunded invoices (keep open invoices)
    const result = await Invoice.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ["paid", "refunded", "void"] },
    });

    logger.info(`Data Retention: Deleted ${result.deletedCount} invoices older than ${retentionDays} days`);
    
    return {
      deleted: result.deletedCount,
      error: null,
    };
  } catch (error) {
    logger.error(`Data Retention Error: Failed to delete old invoices - ${error.message}`);
    return {
      deleted: 0,
      error: error.message,
    };
  }
}

/**
 * Anonymize sensitive data from archived records
 * GDPR/CCPA compliance - right to be forgotten
 * @param {string} patientId - Patient ID to anonymize
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function anonymizePatientData(patientId) {
  try {
    const anonymizedName = `ANONYMIZED_${patientId.substring(0, 8)}`;
    
    // Update patient record with anonymized data
    await Patient.findByIdAndUpdate(patientId, {
      $set: {
        firstName: "ANONYMIZED",
        lastName: anonymizedName,
        email: `anonymized_${patientId}@localhost`,
        phone: "XXXX-XXXX-XXXX",
        address: "ANONYMIZED",
        city: "ANONYMIZED",
        state: "XX",
        zipCode: "00000",
        isAnonymized: true,
        anonymizedAt: new Date(),
      },
    });

    // Update associated audit logs (remove sensitive info)
    await PaymentAudit.updateMany(
      { patientId },
      {
        $set: {
          "patientInfo.email": "ANONYMIZED",
          "patientInfo.name": anonymizedName,
        },
      }
    );

    logger.info(`Data Retention: Anonymized data for patient ${patientId}`);
    
    return {
      success: true,
      error: null,
    };
  } catch (error) {
    logger.error(`Data Retention Error: Failed to anonymize patient data - ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate data retention report
 * Shows what data will be deleted/archived on next cleanup
 * @returns {Promise<{report: object, error: string|null}>}
 */
async function generateRetentionReport() {
  try {
    const retentionDays = RETENTION_POLICIES.auditLogs;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const auditLogCount = await PaymentAudit.countDocuments({
      createdAt: { $lt: cutoffDate },
    });

    const patientRecordsRetentionDays = RETENTION_POLICIES.patientRecords;
    const patientCutoffDate = new Date();
    patientCutoffDate.setDate(patientCutoffDate.getDate() - patientRecordsRetentionDays);

    const patientArchiveCount = await Patient.countDocuments({
      lastActivityAt: { $lt: patientCutoffDate },
      isArchived: { $ne: true },
    });

    const invoiceRetentionDays = RETENTION_POLICIES.invoices;
    const invoiceCutoffDate = new Date();
    invoiceCutoffDate.setDate(invoiceCutoffDate.getDate() - invoiceRetentionDays);

    const invoiceDeleteCount = await Invoice.countDocuments({
      createdAt: { $lt: invoiceCutoffDate },
      status: { $in: ["paid", "refunded", "void"] },
    });

    const report = {
      generatedAt: new Date(),
      policies: RETENTION_POLICIES,
      pendingActions: {
        auditLogsToDelete: auditLogCount,
        patientRecordsToArchive: patientArchiveCount,
        invoicesToDelete: invoiceDeleteCount,
      },
      estimatedDataSize: {
        auditLogs: `${(auditLogCount * 0.5).toFixed(2)} MB`, // ~0.5KB per log
        invoices: `${(invoiceDeleteCount * 0.2).toFixed(2)} MB`, // ~0.2KB per invoice
      },
    };

    return {
      report,
      error: null,
    };
  } catch (error) {
    logger.error(`Data Retention Error: Failed to generate report - ${error.message}`);
    return {
      report: null,
      error: error.message,
    };
  }
}

module.exports = {
  RETENTION_POLICIES,
  deleteOldAuditLogs,
  archiveOldPatientRecords,
  deleteOldInvoices,
  anonymizePatientData,
  generateRetentionReport,
};
