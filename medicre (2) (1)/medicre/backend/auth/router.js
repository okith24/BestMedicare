const express = require("express");
const router = express.Router();
const util = require("util");
const crypto = require("crypto");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const User = require("./userModel"); // Patients
const StaffUser = require("../models/StaffUser"); // Staff collection
const Staff = require("../models/Staff"); // Legacy staff collection
const Session = require("./sessionModel");
const PasswordResetOtp = require("./passwordResetOtpModel");
const SignupOtp = require("./signupOtpModel");
const { isSmsGatewayConfigured, sendSms, normalizePhoneNumber } = require("../services/smsGateway");

// 2FA imports
const twoFactorRouter = require("./twoFactorRouter");
const twoFactorService = require("./twoFactorService");
const { set2FACookie } = require("../middleware/cookieConfig");
const { logAudit } = require("../middleware/audit");

const {
  normalizeEmail,
  hashPassword,
  isValidEmail,
  isValidPhone,
  normalizeNationalId,
  isValidNationalId,
  generatePatientId,
  isStrongPassword,
  verifyPassword,
  createSessionToken,
  hashToken,
  sanitizeUser
} = require("./security");

const { attachAuth, requireAuth } = require("./middleware");

const SESSION_DAYS = 14;
const SIGNUP_OTP_TTL_MINUTES = Math.max(1, Number(process.env.SIGNUP_OTP_TTL_MINUTES || 10));
const SIGNUP_OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.SIGNUP_OTP_MAX_ATTEMPTS || 5));
const PASSWORD_RESET_OTP_TTL_MINUTES = Math.max(1, Number(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || 10));
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || 5));
const PASSWORD_RESET_RESPONSE = "If the phone number is registered, an SMS reset link has been sent.";

/*
RATE LIMITER (LOGIN SECURITY)
*/
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again later."
  }
});

/*
SESSION CREATION
*/
function createSessionExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

async function createSessionForUser(user, req) {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = createSessionExpiry();

  await Session.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    ipAddress: String(req.ip || ""),
    userAgent: String(req.headers["user-agent"] || "")
  });

  return { token, expiresAt };
}

function buildComparablePhoneSet(phone) {
  const raw = String(phone || "").trim();
  const normalized = normalizePhoneNumber(raw);
  const values = new Set();

  if (raw) values.add(raw);
  if (normalized) values.add(normalized);

  if (normalized.startsWith("94") && normalized.length === 11) {
    values.add(`+${normalized}`);
    values.add(`0${normalized.slice(2)}`);
  }

  if (normalized.startsWith("0") && normalized.length === 10) {
    values.add(`94${normalized.slice(1)}`);
    values.add(`+94${normalized.slice(1)}`);
  }

  return values;
}

function phonesMatch(storedPhone, querySet) {
  const storedSet = buildComparablePhoneSet(storedPhone);
  for (const value of storedSet) {
    if (querySet.has(value)) return true;
  }
  return false;
}

async function findUserByPhoneInModel(model, modelName, querySet) {
  const candidates = Array.from(querySet);

  const exact = await model.findOne({
    phone: { $in: candidates },
    isActive: { $ne: false }
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (exact) return { user: exact, modelName };

  const activeUsers = await model.find({
    phone: { $exists: true, $ne: "" },
    isActive: { $ne: false }
  })
    .select("_id phone")
    .lean();

  const hit = activeUsers.find((doc) => phonesMatch(doc.phone, querySet));
  if (!hit?._id) return null;

  const user = await model.findById(hit._id);
  if (!user) return null;

  return { user, modelName };
}

async function findAuthUserByPhone(phone) {
  const querySet = buildComparablePhoneSet(phone);
  if (!querySet.size) return null;

  return (
    await findUserByPhoneInModel(User, "User", querySet)
    || await findUserByPhoneInModel(StaffUser, "StaffUser", querySet)
    || await findUserByPhoneInModel(Staff, "Staff", querySet)
  );
}

function generateResetOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function safeCompareHashes(aHash, bHash) {
  try {
    const a = Buffer.from(String(aHash || ""), "hex");
    const b = Buffer.from(String(bHash || ""), "hex");
    if (!a.length || !b.length || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getUserModelByName(modelName) {
  if (modelName === "User") return User;
  if (modelName === "StaffUser") return StaffUser;
  if (modelName === "Staff") return Staff;
  return null;
}

function getFrontendOrigin() {
  const configuredOrigins = String(process.env.FRONTEND_ORIGIN || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (configuredOrigins.length) return configuredOrigins[0];
  return "http://localhost:5173";
}

function buildPasswordResetLink({ resetId, resetToken }) {
  const configuredUrl = String(process.env.PASSWORD_RESET_FRONTEND_URL || "").trim();
  let link;

  try {
    link = configuredUrl
      ? new URL(configuredUrl)
      : new URL("/forgot-password", getFrontendOrigin());
  } catch {
    link = new URL("/forgot-password", "http://localhost:5173");
  }

  link.searchParams.set("rid", String(resetId));
  link.searchParams.set("rt", String(resetToken));
  return link.toString();
}

function buildSignupWelcomeSmsMessage() {
  return "Welcome to NAWALA Best Medicare! Your account has been successfully created. You can now easily book appointments, check schedules, and manage your health records online.";
}

function buildSignupOtpSmsMessage(otp) {
  return `NAWALA Best Medicare verification code: ${otp}. This OTP is valid for ${SIGNUP_OTP_TTL_MINUTES} minutes.`;
}

async function createSignupOtpForUser(user, pendingProfile = null) {
  const targetPhone = String(user?.phone || pendingProfile?.phone || "").trim();
  const phoneNormalized = normalizePhoneNumber(targetPhone);

  if (!phoneNormalized) {
    throw new Error("Valid phone number is required for signup verification");
  }

  await SignupOtp.deleteMany({
    userId: user._id,
    consumedAt: null
  });

  const otp = generateResetOtp();
  const signupToken = createSessionToken();
  const expiresAt = new Date(Date.now() + SIGNUP_OTP_TTL_MINUTES * 60 * 1000);

  const signupRecord = await SignupOtp.create({
    phoneNormalized,
    userId: user._id,
    pendingProfile: pendingProfile || undefined,
    otpHash: hashToken(otp),
    signupTokenHash: hashToken(signupToken),
    expiresAt
  });

  await sendSms({
    to: targetPhone,
    message: buildSignupOtpSmsMessage(otp)
  });

  return {
    signupId: String(signupRecord._id),
    signupToken,
    expiresAt
  };
}

/*
SIGNUP
*/
router.post("/signup", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const nationalId = normalizeNationalId(req.body?.nationalId);
    const phone = String(req.body?.phone || "").trim();
    const genderRaw = String(req.body?.gender || "").trim().toLowerCase();
    const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : "";
    const password = String(req.body?.password || "");

    if (!name || !email || !nationalId || !gender || !password) {
      return res.status(400).json({
        message: "Name, email, national ID, gender and password are required"
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!isValidNationalId(nationalId)) {
      return res.status(400).json({
        message: "National ID must be 12 digits or 9 digits + V"
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 chars and include uppercase, lowercase, number, and symbol"
      });
    }

    const existing = await User.findOne({
      $or: [{ email }, { nationalId }]
    }).select("_id email nationalId phoneVerifiedAt");

    const patientId = generatePatientId(name, nationalId);
    const { salt, hash } = hashPassword(password);

    let user;
    if (existing && !existing.phoneVerifiedAt) {
      user = await User.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            name,
            email,
            nationalId,
            patientId,
            phone,
            gender,
            role: "patient",
            passwordSalt: salt,
            passwordHash: hash,
            isActive: true,
            phoneVerifiedAt: new Date()
          }
        },
        { new: true, runValidators: true }
      );
    } else {
      user = await User.create({
        name,
        email,
        nationalId,
        patientId,
        phone,
        gender,
        role: "patient",
        passwordSalt: salt,
        passwordHash: hash,
        isActive: true,
        phoneVerifiedAt: new Date()
      });
    }

    const { token, expiresAt } = await createSessionForUser(user, req);

    return res.status(201).json({
      user: sanitizeUser(user),
      token,
      tokenExpiresAt: expiresAt,
      message: "Account created successfully."
    });

  } catch (err) {

    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Email, National ID, or Patient ID already exists" });
    }

    console.error(err);
    return res.status(500).json({ message: "Signup failed" });
  }
});

router.post("/signup/verify", async (req, res) => {
  try {
    const signupId = String(req.body?.signupId || "").trim();
    const signupToken = String(req.body?.signupToken || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!mongoose.Types.ObjectId.isValid(signupId)) {
      return res.status(400).json({ message: "Invalid verification request" });
    }
    if (!signupToken) {
      return res.status(400).json({ message: "Invalid verification request" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "OTP must be a 6-digit code" });
    }

    const signupRecord = await SignupOtp.findOne({
      _id: signupId,
      consumedAt: null
    });

    if (!signupRecord || signupRecord.expiresAt <= new Date()) {
      return res.status(400).json({ message: "Invalid or expired signup OTP" });
    }

    if (Number(signupRecord.attempts || 0) >= SIGNUP_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: "Too many invalid attempts. Request a new OTP." });
    }

    const tokenOk = safeCompareHashes(hashToken(signupToken), signupRecord.signupTokenHash);
    const otpOk = safeCompareHashes(hashToken(otp), signupRecord.otpHash);

    if (!tokenOk || !otpOk) {
      signupRecord.attempts = Number(signupRecord.attempts || 0) + 1;
      await signupRecord.save();
      return res.status(400).json({ message: "Invalid or expired signup OTP" });
    }

    const user = await User.findById(signupRecord.userId);
    if (!user) {
      return res.status(400).json({ message: "Signup account not found" });
    }

    if (signupRecord.pendingProfile?.email) {
      user.name = signupRecord.pendingProfile.name || user.name;
      user.email = signupRecord.pendingProfile.email || user.email;
      user.nationalId = signupRecord.pendingProfile.nationalId || user.nationalId;
      user.patientId = signupRecord.pendingProfile.patientId || user.patientId;
      user.phone = signupRecord.pendingProfile.phone || user.phone;
      user.gender = signupRecord.pendingProfile.gender || user.gender;
      user.passwordSalt = signupRecord.pendingProfile.passwordSalt || user.passwordSalt;
      user.passwordHash = signupRecord.pendingProfile.passwordHash || user.passwordHash;
      user.role = "patient";
      user.isActive = true;
    }

    user.phoneVerifiedAt = new Date();
    await user.save({ validateBeforeSave: false });

    signupRecord.consumedAt = new Date();
    await signupRecord.save();

    await SignupOtp.deleteMany({
      userId: user._id,
      consumedAt: null
    });

    const { token, expiresAt } = await createSessionForUser(user, req);

    if (isSmsGatewayConfigured()) {
      try {
        await sendSms({
          to: user.phone,
          message: buildSignupWelcomeSmsMessage()
        });
      } catch (smsErr) {
        console.error("signup welcome sms error", smsErr?.message || smsErr);
      }
    }

    return res.json({
      user: sanitizeUser(user),
      token,
      tokenExpiresAt: expiresAt
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Account details already belong to another patient" });
    }
    console.error("signup/verify error", err?.message || err);
    return res.status(500).json({ message: "Account verification failed" });
  }
});

router.post("/signup/resend", async (req, res) => {
  try {
    if (!isSmsGatewayConfigured()) {
      return res.status(503).json({
        message: "SMS gateway is not configured. Add SMS credentials in backend .env"
      });
    }

    const signupId = String(req.body?.signupId || "").trim();
    const signupToken = String(req.body?.signupToken || "").trim();

    if (!mongoose.Types.ObjectId.isValid(signupId) || !signupToken) {
      return res.status(400).json({ message: "Invalid verification request" });
    }

    const signupRecord = await SignupOtp.findOne({
      _id: signupId,
      consumedAt: null
    });

    if (!signupRecord) {
      return res.status(400).json({ message: "Invalid verification request" });
    }

    const tokenOk = safeCompareHashes(hashToken(signupToken), signupRecord.signupTokenHash);
    if (!tokenOk) {
      return res.status(400).json({ message: "Invalid verification request" });
    }

    const user = await User.findById(signupRecord.userId);
    if (!user) {
      return res.status(400).json({ message: "This account is not available for verification" });
    }

    const verification = await createSignupOtpForUser(user, signupRecord.pendingProfile || null);
    return res.json({
      requiresOtp: true,
      signupId: verification.signupId,
      signupToken: verification.signupToken,
      expiresAt: verification.expiresAt,
      phone: user.phone || "",
      message: "A new 6-digit OTP has been sent to your mobile number."
    });
  } catch (err) {
    console.error("signup/resend error", err?.message || err);
    return res.status(500).json({ message: "Unable to resend signup OTP right now" });
  }
});

/*
LOGIN
*/
router.post("/signin", loginLimiter, async (req, res) => {
  try {

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const totpCode = String(req.body?.totpCode || "").trim();

    if (!email || !password) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    let user = null;
    let userModel = null;

    // Check patient users
    user = await User.findOne({ email });
    if (user) userModel = 'User';

    // Check staff users
    if (!user) {
      user = await StaffUser.findOne({ email });
      if (user) userModel = 'StaffUser';
    }

    // Check legacy staff users
    if (!user) {
      user = await Staff.findOne({ email });
      if (user) userModel = 'Staff';
    }

    if (!user || user.isActive === false) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    if (!user.passwordSalt || !user.passwordHash) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return res.status(401).json({
        message: "Invalid login configuration"
      });
    }

    const passwordValid = verifyPassword(
      password,
      user.passwordSalt,
      user.passwordHash
    );

    if (!passwordValid) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    // Check if 2FA is required for this user (staff & admin)
    const requiresTwoFactor = user.role === 'staff' || user.role === 'admin';
    
    if (requiresTwoFactor) {
      try {
        const twoFactorStatus = await twoFactorService.getTwoFactorStatus(user._id, userModel);
        
        // If 2FA is enabled but no code provided, prompt for it
        if (twoFactorStatus.isEnabled && !totpCode) {
          logAudit(req, 'authentication', 'signin_2fa_required', {
            userId: String(user._id),
            email: user.email,
            userRole: user.role
          });
          
          return res.status(403).json({
            message: "Two-factor authentication required",
            requires2FA: true,
            userId: String(user._id),
            userModel: userModel,
            hint: "Please provide TOTP code or backup code"
          });
        }

        // If 2FA is enabled and code is provided, verify it
        if (twoFactorStatus.isEnabled && totpCode) {
          try {
            const verifyResult = await twoFactorService.verifyCode(user._id, totpCode, userModel);
            
            if (!verifyResult.success) {
              logAudit(req, 'authentication', 'signin_2fa_failed', {
                userId: String(user._id),
                email: user.email,
                reason: 'Invalid TOTP code',
                securityFlag: true,
                severity: 'medium'
              });
              
              return res.status(401).json({
                message: "Invalid 2FA code. Please try again."
              });
            }
            
            logAudit(req, 'authentication', 'signin_2fa_verified', {
              userId: String(user._id),
              email: user.email,
              userRole: user.role
            });
          } catch (totpErr) {
            console.error("2FA verification error:", totpErr.message);
            logAudit(req, 'authentication', 'signin_2fa_error', {
              userId: String(user._id),
              email: user.email,
              error: totpErr.message,
              securityFlag: true,
              severity: 'high'
            });
            
            return res.status(500).json({
              message: "2FA verification failed. Please try again."
            });
          }
        }
      } catch (twoFactorErr) {
        console.error("2FA status check error:", twoFactorErr.message);
        // Non-blocking error - allow login if 2FA check fails
      }
    }

    try {

      if (!user.username && user.email) {
        user.username = user.email.split("@")[0];
      }

      user.lastLoginAt = new Date();
      user.loginCount = (user.loginCount || 0) + 1;

      await user.save({ validateBeforeSave: false });

    } catch (updErr) {
      console.error("failed to update login stats", updErr);
    }

    let token, expiresAt;

    try {
      ({ token, expiresAt } = await createSessionForUser(user, req));
    } catch (sessErr) {
      console.error("session creation error", sessErr);
      return res.status(500).json({
        message: sessErr.message || "Unable to create session"
      });
    }

    // Log successful login
    logAudit(req, 'authentication', 'signin_success', {
      userId: String(user._id),
      email: user.email,
      userRole: user.role
    });

    res.json({
      user: sanitizeUser(user),
      token,
      tokenExpiresAt: expiresAt
    });

  } catch (err) {

    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : `Signin failed: ${util.inspect(err, { depth: 2 })}`;

    console.error("signin error", err?.stack || err);

    res.status(500).json({ message: msg });
  }
});

/*
FORGOT PASSWORD (SMS LINK + OTP)
*/
router.post("/forgot-password/request", async (req, res) => {
  try {
    if (!isSmsGatewayConfigured()) {
      return res.status(503).json({
        message: "SMS gateway is not configured. Add SMS credentials in backend .env"
      });
    }

    const phone = String(req.body?.phone || "").trim();
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return res.status(400).json({ message: "Valid phone number is required" });
    }

    const account = await findAuthUserByPhone(phone);

    if (!account || account.user?.isActive === false) {
      if (process.env.NODE_ENV === "production") {
        return res.json({ message: PASSWORD_RESET_RESPONSE });
      }
      return res.status(404).json({ message: "Phone number is not linked to any active account" });
    }

    const targetPhone = String(account.user.phone || phone).trim();
    const targetPhoneNormalized = normalizePhoneNumber(targetPhone);

    if (!targetPhoneNormalized) {
      if (process.env.NODE_ENV === "production") {
        return res.json({ message: PASSWORD_RESET_RESPONSE });
      }
      return res.status(400).json({ message: "Matched account has no valid phone number" });
    }

    await PasswordResetOtp.deleteMany({
      userId: account.user._id,
      userModel: account.modelName,
      consumedAt: null
    });

    const otp = generateResetOtp();
    const resetToken = createSessionToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MINUTES * 60 * 1000);

    const resetRecord = await PasswordResetOtp.create({
      phoneNormalized: targetPhoneNormalized,
      userId: account.user._id,
      userModel: account.modelName,
      otpHash: hashToken(otp),
      resetTokenHash: hashToken(resetToken),
      expiresAt
    });

    const resetLink = buildPasswordResetLink({
      resetId: String(resetRecord._id),
      resetToken
    });

    const smsMessage = `MediCare password reset link: ${resetLink} Use code ${otp}. Valid for ${PASSWORD_RESET_OTP_TTL_MINUTES} minutes.`;

    try {
      await sendSms({
        to: targetPhone,
        message: smsMessage
      });
    } catch (smsError) {
      await PasswordResetOtp.deleteOne({ _id: resetRecord._id });
      throw smsError;
    }

    return res.json({ message: PASSWORD_RESET_RESPONSE });
  } catch (err) {
    console.error("forgot-password/request error", err?.message || err);
    return res.status(500).json({ message: "Unable to send reset SMS right now" });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const resetId = String(req.body?.resetId || "").trim();
    const resetToken = String(req.body?.resetToken || "").trim();
    const otp = String(req.body?.otp || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!mongoose.Types.ObjectId.isValid(resetId)) {
      return res.status(400).json({ message: "Invalid reset link" });
    }
    if (!resetToken) {
      return res.status(400).json({ message: "Invalid reset link" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "OTP must be a 6-digit code" });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 8 chars and include uppercase, lowercase, number, and symbol"
      });
    }

    const resetRecord = await PasswordResetOtp.findOne({
      _id: resetId,
      consumedAt: null
    });

    if (!resetRecord || resetRecord.expiresAt <= new Date()) {
      return res.status(400).json({ message: "Invalid or expired reset request" });
    }

    if (Number(resetRecord.attempts || 0) >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: "Too many invalid attempts. Request a new reset link." });
    }

    const tokenOk = safeCompareHashes(hashToken(resetToken), resetRecord.resetTokenHash);
    const otpOk = safeCompareHashes(hashToken(otp), resetRecord.otpHash);

    if (!tokenOk || !otpOk) {
      resetRecord.attempts = Number(resetRecord.attempts || 0) + 1;
      await resetRecord.save();
      return res.status(400).json({ message: "Invalid or expired reset request" });
    }

    const accountModel = getUserModelByName(resetRecord.userModel);
    if (!accountModel) {
      return res.status(400).json({ message: "Invalid reset request" });
    }

    const account = await accountModel.findById(resetRecord.userId);
    if (!account || account.isActive === false) {
      return res.status(400).json({ message: "Invalid reset request" });
    }

    const { salt, hash } = hashPassword(newPassword);
    await accountModel.updateOne(
      { _id: account._id },
      {
        $set: {
          passwordSalt: salt,
          passwordHash: hash
        }
      }
    );

    resetRecord.consumedAt = new Date();
    await resetRecord.save();

    await PasswordResetOtp.deleteMany({
      userId: account._id,
      userModel: resetRecord.userModel,
      consumedAt: null
    });

    await Session.deleteMany({ userId: account._id });

    return res.json({ message: "Password reset successful. Please sign in again." });
  } catch (err) {
    console.error("forgot-password/reset error", err?.message || err);
    return res.status(500).json({ message: "Password reset failed" });
  }
});

/*
CURRENT USER
*/
router.get("/me", attachAuth, requireAuth, async (req, res) => {
  res.json({ user: req.authUser });
});

/*
LOGOUT
*/
router.post("/logout", attachAuth, requireAuth, async (req, res) => {
  try {
    await Session.deleteOne({ tokenHash: req.authTokenHash });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/*
2FA ROUTES
*/
router.use("/", twoFactorRouter);

module.exports = router;


