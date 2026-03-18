const express = require("express");
const router = express.Router();
const { body, param, query, validationResult } = require("express-validator");
const { requireAuth } = require("../../auth/middleware");
const PaymentToken = require("../models/PaymentToken");
const PaymentAudit = require("../models/PaymentAudit");
const { encryptToken } = require("../tokenization");

/**
 * Input validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Validation error",
        details: errors.array().map(e => ({ field: e.param, message: e.msg }))
      }
    });
  }
  next();
};

/**
 * GET /api/tokens
 * List patient's saved payment tokens
 */
router.get(
  "/",
  requireAuth,
  [
    query("status")
      .optional()
      .isIn(["active", "expired", "revoked", "all"]).withMessage("Invalid status")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const patientId = req.user.id;
    const { status } = req.query;

    const filter = { patientId, status: status || "active" };
    const tokens = await PaymentToken.find(filter).sort({ isDefault: -1 });

    const displayTokens = tokens.map((t) => ({
      id: t._id,
      cardLast4: t.cardLast4,
      cardBrand: t.cardBrand,
      expiryMonth: t.expiryMonth,
      expiryYear: t.expiryYear,
      nickname: t.nickname,
      isDefault: t.isDefault,
      status: t.status,
      expiresSoon: t.expiresSoon(),
      createdAt: t.createdAt,
    }));

    res.json({
      success: true,
      data: displayTokens,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: "Failed to retrieve tokens" },
    });
  }
});

/**
 * POST /api/tokens
 * Save a new payment token
 * Body: { cybersourceToken, cardLast4, cardBrand, expiryMonth, expiryYear, nickname, makeDefault }
 */
router.post(
  "/",
  requireAuth,
  [
    body("cybersourceToken")
      .notEmpty().withMessage("Cybersource token is required")
      .trim()
      .isLength({ min: 10, max: 1000 }).withMessage("Invalid token format"),
    body("cardLast4")
      .notEmpty().withMessage("Card last 4 digits required")
      .matches(/^\d{4}$/).withMessage("Card last 4 must be 4 digits"),
    body("cardBrand")
      .notEmpty().withMessage("Card brand is required")
      .isIn(["VISA", "MASTERCARD", "AMEX", "DISCOVER"]).withMessage("Invalid card brand"),
    body("expiryMonth")
      .notEmpty().withMessage("Expiry month is required")
      .isInt({ min: 1, max: 12 }).withMessage("Month must be 1-12"),
    body("expiryYear")
      .notEmpty().withMessage("Expiry year is required")
      .isInt({ min: 2024, max: 2099 }).withMessage("Year must be valid"),
    body("nickname")
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage("Nickname max 50 characters"),
    body("makeDefault")
      .optional()
      .isBoolean().withMessage("makeDefault must be boolean")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const patientId = req.user.id;
    const {
      cybersourceToken,
      cardLast4,
      cardBrand,
      expiryMonth,
      expiryYear,
      nickname,
      makeDefault,
    } = req.body;

    // Validate
    if (!cybersourceToken || !cardLast4 || !cardBrand) {
      return res.status(400).json({
        success: false,
        error: { message: "Missing required card information" },
      });
    }

    // Encrypt token
    const { encrypted, iv } = encryptToken(
      cybersourceToken,
      process.env.PAYMENT_TOKEN_ENCRYPTION_KEY
    );

    // Create token record
    const paymentToken = new PaymentToken({
      patientId,
      cybersourceToken: encrypted,
      tokenIv: iv,
      cardLast4,
      cardBrand,
      expiryMonth,
      expiryYear,
      nickname: nickname || `${cardBrand} ${cardLast4}`,
      status: "active",
      isDefault: makeDefault ? true : false,
    });

    // Set expiration
    if (expiryMonth && expiryYear) {
      const expiryDate = new Date(expiryYear, expiryMonth, 0); // Last day of month
      paymentToken.expiresAt = expiryDate;
    }

    await paymentToken.save();

    // If making default, unset others
    if (makeDefault) {
      await PaymentToken.updateMany(
        { patientId, _id: { $ne: paymentToken._id }, status: "active" },
        { isDefault: false }
      );
    }

    // Create audit log
    await PaymentAudit.create({
      paymentId: null,
      invoiceRef: null,
      eventType: "token_saved",
      details: {
        tokenId: paymentToken._id,
        cardLast4,
        cardBrand,
        isDefault: makeDefault,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: paymentToken._id,
        cardLast4,
        cardBrand,
        expiryMonth,
        expiryYear,
        nickname: paymentToken.nickname,
        isDefault: paymentToken.isDefault,
        expiresSoon: paymentToken.expiresSoon(),
      },
    });
  } catch (error) {
    console.error("Token save error:", error);
    res.status(500).json({
      success: false,
      error: { message: "Failed to save token" },
    });
  }
});

/**
 * GET /api/tokens/:id
 * Get token details
 */
router.get(
  "/:id",
  requireAuth,
  [
    param("id")
      .isMongoId().withMessage("Invalid token ID format")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;
    const token = await PaymentToken.findById(id);

    if (!token || token.patientId.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Token not found" } });
    }

    res.json({
      success: true,
      data: {
        id: token._id,
        cardLast4: token.cardLast4,
        cardBrand: token.cardBrand,
        expiryMonth: token.expiryMonth,
        expiryYear: token.expiryYear,
        nickname: token.nickname,
        isDefault: token.isDefault,
        status: token.status,
        isExpired: token.isExpired(),
        expiresSoon: token.expiresSoon(),
        usageCount: token.usageCount || 0,
        lastUsedAt: token.lastUsedAt,
        createdAt: token.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: "Failed to retrieve token" },
    });
  }
});

/**
 * DELETE /api/tokens/:id
 * Revoke a token
 */
router.delete(
  "/:id",
  requireAuth,
  [
    param("id")
      .isMongoId().withMessage("Invalid token ID format")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const token = await PaymentToken.findById(id);
    if (!token || token.patientId.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Token not found" } });
    }

    const wasDefault = token.isDefault;
    
    // Revoke token
    await token.revoke(reason || "User revoked");

    // If was default, assign default to another active token
    if (wasDefault) {
      const nextActive = await PaymentToken.findOne({
        patientId: req.user.id,
        status: "active",
        _id: { $ne: id },
      }).sort({ createdAt: -1 });

      if (nextActive) {
        await nextActive.setAsDefault();
      }
    }

    // Create audit log
    await PaymentAudit.create({
      paymentId: null,
      invoiceRef: null,
      eventType: "token_revoked",
      details: {
        tokenId: id,
        cardLast4: token.cardLast4,
        reason: reason || "User revoked",
      },
    });

    res.json({
      success: true,
      message: "Token revoked successfully",
      data: { revokedAt: new Date() },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: "Failed to revoke token" },
    });
  }
});

/**
 * POST /api/tokens/:id/default
 * Set token as default payment method
 */
router.post(
  "/:id/default",
  requireAuth,
  [
    param("id")
      .isMongoId().withMessage("Invalid token ID format")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;

    const token = await PaymentToken.findById(id);
    if (!token || token.patientId.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Token not found" } });
    }

    if (!token.isActive()) {
      return res.status(400).json({
        success: false,
        error: { message: "Cannot set inactive token as default" },
      });
    }

    // Unset previous default
    await PaymentToken.updateMany(
      { patientId: req.user.id, _id: { $ne: id } },
      { isDefault: false }
    );

    // Set this as default
    await token.setAsDefault();

    // Create audit log
    await PaymentAudit.create({
      paymentId: null,
      invoiceRef: null,
      eventType: "token_default_set",
      details: {
        tokenId: id,
        cardLast4: token.cardLast4,
      },
    });

    res.json({
      success: true,
      message: "Token set as default",
      data: { id, isDefault: true },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: "Failed to set default token" },
    });
  }
});

/**
 * POST /api/tokens/:id/verify
 * Verify token validity
 */
router.post(
  "/:id/verify",
  requireAuth,
  [
    param("id")
      .isMongoId().withMessage("Invalid token ID format")
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;

    const token = await PaymentToken.findById(id);
    if (!token || token.patientId.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Token not found" } });
    }

    const isActive = token.isActive();
    const isExpired = token.isExpired();

    // Update status if expired
    if (isExpired && token.status !== "expired") {
      token.status = "expired";
      await token.save();
    }

    // Create audit log
    await PaymentAudit.create({
      paymentId: null,
      invoiceRef: null,
      eventType: "token_verified",
      details: {
        tokenId: id,
        isActive,
        isExpired,
      },
    });

    res.json({
      success: true,
      data: {
        id,
        isValid: isActive && !isExpired,
        isExpired,
        expiresAt: token.expiresAt,
        status: token.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: "Failed to verify token" },
    });
  }
});

module.exports = router;
