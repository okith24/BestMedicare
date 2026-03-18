const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function loadEnvironment() {
  const candidates = [
    path.join(__dirname, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "backend", ".env"),
    path.join(__dirname, "..", ".env"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const result = dotenv.config({ path: envPath, override: false });
    if (!result.error) {
      console.log(`[env] Loaded environment from ${envPath}`);
      return envPath;
    }
  }

  console.warn("[env] No .env file found in expected locations");
  return null;
}

loadEnvironment();

function logFatalStartupError(kind, error) {
  console.error(`\n[FATAL:${kind}]`, error?.stack || error?.message || error);
}

process.on("uncaughtException", (error) => {
  logFatalStartupError("uncaughtException", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logFatalStartupError("unhandledRejection", reason);
  process.exit(1);
});

// ============================================================
// CRITICAL: VALIDATE ALL SECRETS BEFORE STARTING SERVER
// ============================================================
const { validateSecrets } = require("./config/secrets");
try {
  validateSecrets();
} catch (error) {
  console.error("\n" + "=".repeat(60));
  console.error("STARTUP FAILED - SECURITY CONFIGURATION ERROR");
  console.error("=".repeat(60));
  console.error(error.message);
  process.exit(1);
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const connectDB = require("./config/db");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const morgan = require("morgan");

// Data protection & audit logging
const { attachAuditContext } = require("./middleware/audit");

// Cookie & session management
const { initializeCookies, verify2FACookie } = require("./middleware/cookieConfig");

const app = express();
const paymentsEnabled = ["1", "true", "yes", "on"].includes(
  String(process.env.PAYMENTS_ENABLED || "true").trim().toLowerCase()
);

/* 
   DATABASE CONNECTION
*/
connectDB();

/* 
   SECURITY MIDDLEWARE
*/
app.use(helmet()); // Secure HTTP headers
app.use(mongoSanitize()); // Prevent MongoDB injection
app.use(morgan("combined")); // Request logging

// ============================================================
// AUDIT LOGGING - Log all sensitive operations
// ============================================================
app.use(attachAuditContext);

// ============================================================
// 2FA VERIFICATION - Check if user has verified 2FA
// ============================================================
app.use(verify2FACookie);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 payment requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many payment requests. Please try again later.",
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 auth attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts. Please try again later.",
});

// ============================================================
// COOKIE & SESSION INITIALIZATION
// ============================================================
try {
  initializeCookies(app);
  console.log('✅ Cookies & Session Management Initialized');
} catch (error) {
  console.error('❌ Cookie initialization failed:', error.message);
  process.exit(1);
}

app.use("/api", limiter);
app.use("/api/auth/signin", authLimiter);
app.use("/api/auth/signup", authLimiter);

/* 
   CORS CONFIGURATION
*/
const allowedOrigins = String(
  process.env.FRONTEND_ORIGIN || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/* 
   SECURITY HEADERS
*/
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
});

/* 
   MIDDLEWARE
*/
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "1mb", strict: true }));

/* 
   TEST ROUTES
*/
app.get("/test-db", async (req, res) => {
  const state = mongoose.connection.readyState;
  const states = {
    0: "Disconnected",
    1: "Connected",
    2: "Connecting",
    3: "Disconnecting",
  };

  res.json({ status: states[state] });
});

app.get("/", (req, res) => {
  res.send("Hospital API is running");
});

/* 
   ROUTES
*/

const patientRoutes = require("./patient/router");
const authRoutes = require("./auth/router");
const staffRoutes = require("./staff/router");
const billPaymentRoutes = require("./bill-payment/router");
const echannelingRoutes = require("./echanneling/router");
const { startAppointmentReminderService } = require("./echanneling/reminderService");
const adminRoutes = require("./routes/adminRoutes");
const chatbotRoutes = require("./chatbot/router");

// Data retention & compliance
const { startScheduler } = require("./dataRetention/DataRetentionScheduler");
const dataRetentionRoutes = require("./dataRetention/routes");

// Security alerting
const alertingRoutes = require("./security/alertingRoutes");

// API Key management
const apiKeyRoutes = require("./apiKeys/apiKeyRoutes");

app.use("/api/patients", patientRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/bill-payment", billPaymentRoutes);
app.use("/api/invoices", billPaymentRoutes);
app.use("/api/echanneling", echannelingRoutes);
app.use("/api/admin", adminRoutes); // SUPER ADMIN ROUTES
app.use("/api/chatbot", chatbotRoutes);

// Payment system routes with stricter rate limiting
if (paymentsEnabled) {
  const paymentRoutes = require("./payments/routes/paymentRoutes");
  const tokenRoutes = require("./payments/routes/tokenRoutes");
  const webhookRoutes = require("./payments/routes/webhookRoutes");

  app.use("/api/payments", paymentLimiter, paymentRoutes);
  app.use("/api/tokens", paymentLimiter, tokenRoutes);
  app.use("/api/payments/webhooks", webhookRoutes);
  console.log("Payment routes enabled");
} else {
  console.warn("Payment routes disabled because PAYMENTS_ENABLED=false");
}

// Data retention & compliance management routes
app.use("/api/data-retention", dataRetentionRoutes);

// Security alerting routes
app.use("/api/security/alerts", alertingRoutes);

// API Key management routes
app.use("/api/api-keys", apiKeyRoutes);

/* 
   BACKGROUND SERVICES
*/
startAppointmentReminderService();

// Start data retention scheduler
try {
  startScheduler();
  console.log('✅ Data Retention Scheduler initialized');
} catch (error) {
  console.error('❌ Failed to initialize Data Retention Scheduler:', error.message);
}

/* 
   GLOBAL ERROR HANDLER
*/
app.use((err, req, res, next) => {
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin not allowed" });
  }

  console.error(err);
  return res.status(500).json({ message: "Internal Server Error" });
});

/* 
   START SERVER
*/
const PORT = process.env.PORT || 5000;
const https = require('https');

// Try to load HTTPS certificates if in production
let server;

if (process.env.NODE_ENV === 'production') {
  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
  
  if (httpsEnabled) {
    try {
      const privateKey = fs.readFileSync(process.env.HTTPS_KEY_PATH, 'utf8');
      const certificate = fs.readFileSync(process.env.HTTPS_CERT_PATH, 'utf8');
      
      const credentials = { key: privateKey, cert: certificate };
      server = https.createServer(credentials, app);
      console.log('✅ HTTPS Server initialized');
    } catch (error) {
      console.warn('⚠️  HTTPS certificates not found, falling back to HTTP');
      server = require('http').createServer(app);
    }
  } else {
    server = require('http').createServer(app);
    console.warn('⚠️  WARNING: HTTPS not enabled in production!');
  }
} else {
  server = require('http').createServer(app);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
⚠️  Port ${PORT} is already in use. Check for another running server or set a different PORT in your .env file.
`);
    process.exit(1);
  }
  logFatalStartupError("server", err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════════╗
  ║         HOSPITAL MANAGEMENT SYSTEM - BACKEND           ║
  ║                  Server Started                        ║
  ╠════════════════════════════════════════════════════════╣
  ║ Port: ${PORT} (${process.env.NODE_ENV || 'development'})
  ║ Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⚠️  Pending'}
  ║ Audit Logging: ✅ Enabled
  ║ Secrets Validation: ✅ Passed
  ╚════════════════════════════════════════════════════════╝
  `);
});
