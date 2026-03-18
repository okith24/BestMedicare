/**
 * API Key Authentication Middleware
 * Validates API keys and implements rate limiting per key
 */

const APIKey = require("./APIKeyModel");
const PaymentAudit = require("../payments/models/PaymentAudit");
const logger = require("../config/logger");

// In-memory rate limit tracking (use Redis in production)
const rateLimitTracker = new Map();

/**
 * Authenticate API key from request header or query param
 * Header: Authorization: Bearer sk_xxxxx
 * Query: ?api_key=sk_xxxxx
 */
async function authenticateApiKey(req, res, next) {
  try {
    // Get API key from header or query
    let apiKey = req.headers.authorization?.replace("Bearer ", "");
    if (!apiKey) {
      apiKey = req.query.api_key;
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { message: "API key is required" },
      });
    }

    // Find and verify API key
    const crypto = require("crypto");
    const keyHash = crypto
      .createHash("sha256")
      .update(apiKey)
      .digest("hex");
    const apiKeyDoc = await APIKey.findOne({ keyHash });

    if (!apiKeyDoc || !apiKeyDoc.verifyKey(apiKey)) {
      // Log failed authentication
      await PaymentAudit.create({
        action: "API_KEY_AUTH_FAILED",
        details: {
          keyLastFour: apiKey ? apiKey.slice(-4) : "unknown",
          ip: req.ip,
          endpoint: req.path,
        },
        severity: "HIGH",
      });

      return res.status(401).json({
        success: false,
        error: { message: "Invalid or expired API key" },
      });
    }

    // Check if key is expired
    if (apiKeyDoc.isExpired()) {
      return res.status(401).json({
        success: false,
        error: { message: "API key has expired" },
      });
    }

    // Check IP whitelist
    if (!apiKeyDoc.isIpAllowed(req.ip)) {
      await PaymentAudit.create({
        action: "API_KEY_IP_BLOCKED",
        details: {
          keyId: apiKeyDoc._id,
          requestIp: req.ip,
          whitelistedIps: apiKeyDoc.ipWhitelist,
        },
        severity: "MEDIUM",
      });

      return res.status(403).json({
        success: false,
        error: { message: "Your IP is not whitelisted for this API key" },
      });
    }

    // Check rate limit
    const rateLimitStatus = checkRateLimit(apiKeyDoc._id.toString(), apiKeyDoc.rateLimit);
    if (rateLimitStatus.exceeded) {
      await apiKeyDoc.recordRateLimitExceeded();

      return res.status(429).json({
        success: false,
        error: {
          message: "Rate limit exceeded",
          retryAfter: rateLimitStatus.retryAfter,
        },
      });
    }

    // Update API key with usage
    await apiKeyDoc.recordUsage(true, req.ip);

    // Attach API key info to request
    req.apiKey = apiKeyDoc;
    req.apiKeyId = apiKeyDoc._id;

    next();
  } catch (error) {
    logger.error(`API Key authentication error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Authentication failed" },
    });
  }
}

/**
 * Check rate limit for API key
 * Returns: { exceeded: boolean, retryAfter: number }
 */
function checkRateLimit(keyId, limits) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);

  if (!rateLimitTracker.has(keyId)) {
    rateLimitTracker.set(keyId, {
      minute: minute,
      minuteRequests: 0,
      dayRequests: 0,
      dayStart: now,
    });
  }

  const tracker = rateLimitTracker.get(keyId);

  // Reset minute counter if new minute
  if (tracker.minute !== minute) {
    tracker.minute = minute;
    tracker.minuteRequests = 0;
  }

  // Reset day counter if 24 hours passed
  if (now - tracker.dayStart > 24 * 60 * 60 * 1000) {
    tracker.dayStart = now;
    tracker.dayRequests = 0;
  }

  // Increment counters
  tracker.minuteRequests += 1;
  tracker.dayRequests += 1;

  // Check limits
  const minuteExceeded = tracker.minuteRequests > limits.requestsPerMinute;
  const dayExceeded = tracker.dayRequests > limits.requestsPerDay;

  if (minuteExceeded || dayExceeded) {
    return {
      exceeded: true,
      retryAfter: minuteExceeded ? 60 : 3600,
    };
  }

  return {
    exceeded: false,
  };
}

/**
 * Check if API key has specific permission
 */
function requireApiPermission(permission) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: { message: "API key authentication required" },
      });
    }

    if (!req.apiKey.hasPermission(permission)) {
      return res.status(403).json({
        success: false,
        error: { message: `Permission '${permission}' is required` },
      });
    }

    next();
  };
}

module.exports = {
  authenticateApiKey,
  checkRateLimit,
  requireApiPermission,
};
