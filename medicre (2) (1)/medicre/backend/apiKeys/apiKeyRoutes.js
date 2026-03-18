/**
 * API Key Management Routes
 * Create, list, revoke, and monitor API keys for third-party integrations
 */

const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../auth/middleware");
const APIKey = require("./APIKeyModel");
const PaymentAudit = require("../payments/models/PaymentAudit");
const logger = require("../config/logger");

/**
 * POST /api/api-keys
 * Create new API key
 * Requires auth (users create their own keys)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      name,
      permissions = ["payments:read"],
      description,
      tags,
      rateLimit,
      ipWhitelist,
      expiresAt,
    } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: "API key name is required" },
      });
    }

    // Create new API key
    const { apiKey: apiKeyDoc, rawKey } = await APIKey.createKey({
      name: name.trim(),
      createdBy: req.user.id,
      permissions,
      description: description || "",
      tags: tags || [],
      rateLimit: rateLimit || {
        requestsPerMinute: 60,
        requestsPerDay: 10000,
      },
      ipWhitelist: ipWhitelist || [],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Log key creation
    await PaymentAudit.create({
      action: "API_KEY_CREATED",
      userId: req.user.id,
      userEmail: req.user.email,
      details: {
        keyId: apiKeyDoc._id,
        name,
        permissions,
      },
      severity: "MEDIUM",
    });

    res.status(201).json({
      success: true,
      message: "API key created successfully",
      data: {
        ...apiKeyDoc.toSafeJSON(),
        rawKey: rawKey, // Only shown once at creation!
        warning: "Save this key securely. It will not be shown again!",
      },
    });
  } catch (error) {
    logger.error(`Error creating API key: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to create API key" },
    });
  }
});

/**
 * GET /api/api-keys
 * List all API keys for authenticated user
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const apiKeys = await APIKey.find({ createdBy: req.user.id })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 });

    const total = await APIKey.countDocuments({ createdBy: req.user.id });

    res.json({
      success: true,
      data: {
        keys: apiKeys.map((key) => key.toSafeJSON()),
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error(`Error listing API keys: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to list API keys" },
    });
  }
});

/**
 * GET /api/api-keys/:id
 * Get specific API key details
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const apiKey = await APIKey.findById(req.params.id);

    if (!apiKey || apiKey.createdBy.toString() !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: "API key not found" },
      });
    }

    res.json({
      success: true,
      data: apiKey.toSafeJSON(),
    });
  } catch (error) {
    logger.error(`Error getting API key: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to get API key" },
    });
  }
});

/**
 * PATCH /api/api-keys/:id
 * Update API key configuration
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const apiKey = await APIKey.findById(req.params.id);

    if (!apiKey || apiKey.createdBy.toString() !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: "API key not found" },
      });
    }

    // Allow updating certain fields
    const updates = ["name", "description", "tags", "rateLimit", "ipWhitelist", "expiresAt"];
    const updateData = {};

    for (const field of updates) {
      if (field in req.body) {
        if (field === "expiresAt" && req.body[field]) {
          updateData[field] = new Date(req.body[field]);
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    Object.assign(apiKey, updateData);
    await apiKey.save();

    // Log update
    await PaymentAudit.create({
      action: "API_KEY_UPDATED",
      userId: req.user.id,
      userEmail: req.user.email,
      details: {
        keyId: apiKey._id,
        updates: updateData,
      },
      severity: "MEDIUM",
    });

    res.json({
      success: true,
      message: "API key updated",
      data: apiKey.toSafeJSON(),
    });
  } catch (error) {
    logger.error(`Error updating API key: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to update API key" },
    });
  }
});

/**
 * POST /api/api-keys/:id/revoke
 * Revoke an API key (permanent)
 */
router.post("/:id/revoke", requireAuth, async (req, res) => {
  try {
    const apiKey = await APIKey.findById(req.params.id);

    if (!apiKey || apiKey.createdBy.toString() !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: "API key not found" },
      });
    }

    await apiKey.revoke(req.body.reason);

    // Log revocation
    await PaymentAudit.create({
      action: "API_KEY_REVOKED",
      userId: req.user.id,
      userEmail: req.user.email,
      details: {
        keyId: apiKey._id,
        reason: req.body.reason || "No reason provided",
      },
      severity: "HIGH",
    });

    res.json({
      success: true,
      message: "API key revoked",
    });
  } catch (error) {
    logger.error(`Error revoking API key: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to revoke API key" },
    });
  }
});

/**
 * POST /api/api-keys/:id/suspend
 * Suspend an API key (temporary, can be reactivated)
 * Admin only
 */
router.post(
  "/:id/suspend",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const apiKey = await APIKey.findById(req.params.id);

      if (!apiKey) {
        return res.status(404).json({
          success: false,
          error: { message: "API key not found" },
        });
      }

      await apiKey.suspend(req.body.reason);

      // Log suspension
      await PaymentAudit.create({
        action: "API_KEY_SUSPENDED",
        adminId: req.user.id,
        adminEmail: req.user.email,
        details: {
          keyId: apiKey._id,
          reason: req.body.reason,
        },
        severity: "HIGH",
      });

      res.json({
        success: true,
        message: "API key suspended",
      });
    } catch (error) {
      logger.error(`Error suspending API key: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to suspend API key" },
      });
    }
  }
);

/**
 * POST /api/api-keys/:id/reactivate
 * Reactivate suspended API key
 * Admin only
 */
router.post(
  "/:id/reactivate",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const apiKey = await APIKey.findById(req.params.id);

      if (!apiKey) {
        return res.status(404).json({
          success: false,
          error: { message: "API key not found" },
        });
      }

      if (apiKey.status === "revoked") {
        return res.status(400).json({
          success: false,
          error: { message: "Cannot reactivate revoked keys" },
        });
      }

      apiKey.status = "active";
      apiKey.suspendedAt = null;
      await apiKey.save();

      // Log reactivation
      await PaymentAudit.create({
        action: "API_KEY_REACTIVATED",
        adminId: req.user.id,
        adminEmail: req.user.email,
        details: {
          keyId: apiKey._id,
        },
        severity: "MEDIUM",
      });

      res.json({
        success: true,
        message: "API key reactivated",
      });
    } catch (error) {
      logger.error(`Error reactivating API key: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: "Failed to reactivate API key" },
      });
    }
  }
);

/**
 * DELETE /api/api-keys/:id
 * Delete API key (admin can delete any, users can delete own)
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const apiKey = await APIKey.findById(req.params.id);

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: { message: "API key not found" },
      });
    }

    // Check authorization (own key or admin)
    const isOwner = apiKey.createdBy.toString() === req.user.id;
    const isAdmin = req.user.role === "admin" || req.user.role === "super_admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: { message: "Not authorized to delete this key" },
      });
    }

    await APIKey.deleteOne({ _id: req.params.id });

    // Log deletion
    await PaymentAudit.create({
      action: "API_KEY_DELETED",
      userId: req.user.id,
      userEmail: req.user.email,
      details: {
        keyId: apiKey._id,
        deletedBy: req.user.email,
      },
      severity: "MEDIUM",
    });

    res.json({
      success: true,
      message: "API key deleted",
    });
  } catch (error) {
    logger.error(`Error deleting API key: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to delete API key" },
    });
  }
});

/**
 * GET /api/api-keys/:id/usage
 * Get usage statistics for API key
 */
router.get("/:id/usage", requireAuth, async (req, res) => {
  try {
    const apiKey = await APIKey.findById(req.params.id);

    if (!apiKey || apiKey.createdBy.toString() !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: "API key not found" },
      });
    }

    res.json({
      success: true,
      data: {
        keyId: apiKey._id,
        name: apiKey.name,
        usageStats: apiKey.usageStats,
        lastUsedAt: apiKey.lastUsedAt,
        lastUsedIp: apiKey.lastUsedIp,
      },
    });
  } catch (error) {
    logger.error(`Error getting API key usage: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to get usage statistics" },
    });
  }
});

module.exports = router;
