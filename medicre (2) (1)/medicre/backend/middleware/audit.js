const AuditLog = require('../models/AuditLog');

function normalizeAuditCategory(category) {
  const raw = String(category || '').trim().toLowerCase();
  if (!raw) return 'access';
  if (raw === 'authentication') return 'auth';
  if (['auth', 'payment', 'data', 'admin', 'access', 'error'].includes(raw)) {
    return raw;
  }
  return 'access';
}

function defaultResourceTypeForCategory(category) {
  switch (category) {
    case 'auth':
      return 'Session';
    case 'payment':
      return 'Payment';
    case 'data':
      return 'Patient';
    case 'admin':
      return 'AdminAction';
    case 'access':
    case 'error':
    default:
      return 'Config';
  }
}

/**
 * ============================================================
 * AUDIT LOGGING MIDDLEWARE
 * ============================================================
 * 
 * Automatically logs sensitive operations
 * Attaches audit context to requests
 * Flags suspicious activity
 */

/**
 * Attach audit context to every request
 * Usage: app.use(attachAuditContext);
 */
function attachAuditContext(req, res, next) {
  req.auditContext = {
    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || '',
    method: req.method,
    endpoint: req.path,
    timestamp: new Date(),
    userId: req.authUser?._id || null,
    userRole: req.authUser?.role || 'anonymous',
    userIdentifier: req.authUser?.email || req.authUser?.phone || null
  };

  next();
}

/**
 * Log an action to audit trail
 * Usage: await logAudit(req, 'payment', 'PAYMENT_PROCESSED', { ... })
 */
async function logAudit(req, category, action, data = {}) {
  try {
    if (!req.auditContext) {
      console.warn('Audit context not available on request object');
      return null;
    }

    const normalizedCategory = normalizeAuditCategory(category);
    const resourceType = data.resourceType || defaultResourceTypeForCategory(normalizedCategory);

    const auditData = {
      userId: req.auditContext.userId,
      userRole: req.auditContext.userRole,
      userIdentifier: req.auditContext.userIdentifier,
      category: normalizedCategory,
      action,
      description: data.description || null,
      result: data.result || 'success',
      errorMessage: data.errorMessage || null,
      resourceType,
      resourceId: data.resourceId || null,
      changes: data.changes || null,
      cardLast4: data.cardLast4 || null,
      amount: data.amount || null,
      currency: data.currency || null,
      containsSensitiveData: data.containsSensitiveData || false,
      sensitiveFields: data.sensitiveFields || [],
      ipAddress: req.auditContext.ipAddress,
      userAgent: req.auditContext.userAgent,
      location: data.location || null,
      endpoint: req.auditContext.endpoint,
      method: req.auditContext.method,
      securityFlag: data.securityFlag || false,
      flagReason: data.flagReason || null,
      severity: data.severity || 'low',
      requiresReview: data.requiresReview || false
    };

    return await AuditLog.create(auditData);
  } catch (error) {
    console.error('Failed to log audit:', error);
    // Don't throw - audit logging shouldn't crash the app
    return null;
  }
}

/**
 * Middleware to automatically log all auth actions
 */
function auditAuthActions(req, res, next) {
  // Intercept response to log results
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Check if this was successful auth
    if (data && !data.error && !data.message?.includes('failed')) {
      logAudit(req, 'auth', 'LOGIN_SUCCESS', {
        description: `User ${req.auditContext.userIdentifier} logged in`,
        result: 'success'
      }).catch(console.error);
    }

    return originalJson(data);
  };

  next();
}

/**
 * Middleware to log payment operations
 */
function auditPaymentOperations(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    if (req.method !== 'GET' && req.auditContext.endpoint.includes('/payment')) {
      logAudit(req, 'payment', 'PAYMENT_OPERATION', {
        description: `${req.method} ${req.auditContext.endpoint}`,
        result: data.error ? 'failure' : 'success',
        errorMessage: data.error || null,
        resourceType: 'Payment',
        containsSensitiveData: true,
        sensitiveFields: ['amount', 'currency']
      }).catch(console.error);
    }

    return originalJson(data);
  };

  next();
}

/**
 * Log data access for compliance
 */
async function logDataAccess(req, resourceType, resourceId, sensitiveFields = []) {
  return logAudit(req, 'data', 'DATA_ACCESSED', {
    description: `Accessed ${resourceType} ${resourceId}`,
    resourceType,
    resourceId,
    containsSensitiveData: sensitiveFields.length > 0,
    sensitiveFields: sensitiveFields
  });
}

/**
 * Log data modification
 */
async function logDataModification(req, resourceType, resourceId, changes = {}) {
  return logAudit(req, 'data', 'DATA_MODIFIED', {
    description: `Modified ${resourceType} ${resourceId}`,
    resourceType,
    resourceId,
    changes
  });
}

/**
 * Log security-sensitive action
 */
async function logSecurityEvent(req, action, flagReason, severity = 'high') {
  return logAudit(req, 'access', action, {
    securityFlag: true,
    flagReason,
    severity,
    requiresReview: severity === 'critical' || severity === 'high'
  });
}

/**
 * Detect suspicious patterns
 */
function detectSuspiciousActivity(req, failureCount = 0) {
  const flags = [];

  // Check for rapid repeated failures
  if (failureCount > 3) {
    flags.push({
      reason: 'suspicious_failures',
      severity: 'high'
    });
  }

  // Check for unusual time (2 AM)
  const hour = new Date().getHours();
  if (hour < 6 && hour > 2) {
    flags.push({
      reason: 'unusual_time',
      severity: 'low'
    });
  }

  // Check user agent consistency (if we have previous)
  // This would require comparing against stored sessions

  return flags;
}

module.exports = {
  attachAuditContext,
  logAudit,
  auditAuthActions,
  auditPaymentOperations,
  logDataAccess,
  logDataModification,
  logSecurityEvent,
  detectSuspiciousActivity
};
