/**
 * API Key Model & Management
 * Third-party integrations with rate limiting and audit trail
 */

const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * API Key Schema
 */
const APIKeySchema = new mongoose.Schema(
  {
    // Key identification
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      description: "Human-readable name for the API key",
    },
    
    // Key management
    keyHash: {
      type: String,
      required: true,
      unique: true,
      description: "SHA-256 hash of the actual API key",
    },
    
    lastFour: {
      type: String,
      required: true,
      description: "Last 4 characters of the API key for identification",
    },
    
    // Owner information
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    
    // Scope and permissions
    permissions: {
      type: [String],
      enum: [
        "payments:read",
        "payments:write",
        "payments:refund",
        "tokens:read",
        "tokens:write",
        "patients:read",
        "invoices:read",
        "invoices:write",
        "reports:read",
      ],
      default: ["payments:read"],
      description: "Granular permissions for this API key",
    },
    
    // Rate limiting
    rateLimit: {
      requestsPerMinute: {
        type: Number,
        default: 60,
        min: 1,
        max: 10000,
      },
      requestsPerDay: {
        type: Number,
        default: 10000,
        min: 1,
        max: 1000000,
      },
    },
    
    // IP whitelist
    ipWhitelist: {
      type: [String],
      default: [],
      description: "List of allowed IP addresses (empty = all)",
    },
    
    // Webhook configuration
    webhookUrl: {
      type: String,
      description: "URL for event notifications",
    },
    
    // Status and expiration
    status: {
      type: String,
      enum: ["active", "suspended", "expired", "revoked"],
      default: "active",
    },
    
    expiresAt: {
      type: Date,
      description: "Expiration date of the API key",
    },
    
    // Activity tracking
    lastUsedAt: {
      type: Date,
    },
    
    lastUsedIp: {
      type: String,
    },
    
    usageStats: {
      totalRequests: {
        type: Number,
        default: 0,
      },
      successfulRequests: {
        type: Number,
        default: 0,
      },
      failedRequests: {
        type: Number,
        default: 0,
      },
      rateLimitExceeded: {
        type: Number,
        default: 0,
      },
    },
    
    // Metadata
    description: {
      type: String,
      maxlength: 500,
    },
    
    tags: {
      type: [String],
      default: [],
    },
    
    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },
    
    revokedAt: {
      type: Date,
    },
    
    suspendedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

/**
 * Indexes for efficient queries
 */
// keyHash already has unique index via schema property
APIKeySchema.index({ createdBy: 1 });
APIKeySchema.index({ status: 1 });
APIKeySchema.index({ expiresAt: 1 });
APIKeySchema.index({ lastUsedAt: -1 });

/**
 * Static method: Generate new API key
 */
APIKeySchema.statics.generateNewKey = function() {
  const key = "sk_" + crypto.randomBytes(32).toString("hex");
  return key;
};

/**
 * Static method: Hash API key
 */
APIKeySchema.statics.hashKey = function(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
};

/**
 * Static method: Create new API key
 */
APIKeySchema.statics.createKey = async function(data) {
  const key = this.generateNewKey();
  const keyHash = this.hashKey(key);
  const lastFour = key.slice(-4);

  const newAPIKey = await this.create({
    ...data,
    keyHash,
    lastFour,
  });

  // Return both the model and the raw key (only shown once)
  return {
    apiKey: newAPIKey,
    rawKey: key,
  };
};

/**
 * Instance method: Verify if API key matches
 */
APIKeySchema.methods.verifyKey = function(key) {
  const keyHash = this.constructor.hashKey(key);
  return this.keyHash === keyHash && this.status === "active" && this.isValid();
};

/**
 * Instance method: Check if key is valid (not expired, active)
 */
APIKeySchema.methods.isValid = function() {
  if (this.status !== "active") {
    return false;
  }
  
  if (this.expiresAt && this.expiresAt < new Date()) {
    return false;
  }
  
  return true;
};

/**
 * Instance method: Check if request IP is allowed
 */
APIKeySchema.methods.isIpAllowed = function(ip) {
  if (this.ipWhitelist.length === 0) {
    return true; // No whitelist = allow all
  }
  
  return this.ipWhitelist.includes(ip);
};

/**
 * Instance method: Check if user has permission
 */
APIKeySchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

/**
 * Instance method: Increment usage stats
 */
APIKeySchema.methods.recordUsage = async function(success, ip) {
  this.lastUsedAt = new Date();
  this.lastUsedIp = ip;
  this.usageStats.totalRequests += 1;
  
  if (success) {
    this.usageStats.successfulRequests += 1;
  } else {
    this.usageStats.failedRequests += 1;
  }
  
  await this.save();
};

/**
 * Instance method: Increment rate limit exceeded count
 */
APIKeySchema.methods.recordRateLimitExceeded = async function() {
  this.usageStats.rateLimitExceeded += 1;
  await this.save();
};

/**
 * Instance method: Revoke key
 */
APIKeySchema.methods.revoke = async function(reason) {
  this.status = "revoked";
  this.revokedAt = new Date();
  await this.save();
};

/**
 * Instance method: Suspend key
 */
APIKeySchema.methods.suspend = async function(reason) {
  this.status = "suspended";
  this.suspendedAt = new Date();
  await this.save();
};

/**
 * Instance method: Check if expired
 */
APIKeySchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

/**
 * Get safe representation (without sensitive data)
 */
APIKeySchema.methods.toSafeJSON = function() {
  return {
    id: this._id,
    name: this.name,
    lastFour: this.lastFour,
    permissions: this.permissions,
    rateLimit: this.rateLimit,
    status: this.status,
    expiresAt: this.expiresAt,
    isExpired: this.isExpired(),
    lastUsedAt: this.lastUsedAt,
    usageStats: this.usageStats,
    createdAt: this.createdAt,
    description: this.description,
    tags: this.tags,
  };
};

module.exports = mongoose.model("APIKey", APIKeySchema);
