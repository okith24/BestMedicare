# Data Protection Implementation Guide

## Overview
Your system now includes enterprise-grade data protection covering:
- ✅ Secrets validation and management
- ✅ Comprehensive audit logging
- ✅ Field-level encryption for sensitive data
- ✅ HTTPS enforcement ready
- ✅ Automatic security configuration validation

---

## 1. Secrets Management & Validation

### Purpose
Validates all critical environment variables before server startup to prevent data breaches from misconfiguration.

### Features
- Validates required secrets are present
- Checks minimum length requirements  
- Prevents production deployments with test/sample keys
- Provides clear error messages

### Usage
```javascript
// Already integrated in server.js
const { validateSecrets } = require('./config/secrets');

// Manual validation anytime:
validateSecrets(); // Throws error if any secrets missing

// Get a secret safely:
const { getSecret } = require('./config/secrets');
const apiKey = getSecret('CYBERSOURCE_API_KEY');

// Check if secret exists:
const { hasSecret } = require('./config/secrets');
if (hasSecret('JWT_SECRET')) { /* ... */ }
```

### Required Secrets
- `MONGO_URI` - Database connection
- `CYBERSOURCE_API_KEY` - Payment processing
- `CYBERSOURCE_SECRET_KEY` - Payment signing (64 hex chars)
- `PAYMENT_TOKEN_ENCRYPTION_KEY` - Card token encryption (64 hex chars)
- `DATA_ENCRYPTION_KEY` - Field encryption (64 hex chars)

### Generating Encryption Keys
```bash
# Generate new encryption key (32 bytes = 64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Audit Logging System

### Purpose
Tracks all sensitive operations for compliance (HIPAA, PCI-DSS) and fraud investigation.

### What Gets Logged
- ✅ All login/logout activities
- ✅ Password changes and resets
- ✅ Payment transactions (amount, card last4, status)
- ✅ Patient data access (flagged if PHI accessed)
- ✅ Data modifications with before/after values
- ✅ Admin/staff permission changes
- ✅ Failed authentication attempts
- ✅ Security-flagged events

### Usage in Routes

```javascript
const { logAudit, logDataAccess, logSecurityEvent } = require('../middleware/audit');

// Log a successful operation
router.post('/api/payments/charge', async (req, res) => {
  try {
    // Process payment...
    const payment = await Payment.create({ /* ... */ });
    
    // Log the transaction
    await logAudit(req, 'payment', 'PAYMENT_PROCESSED', {
      description: 'Payment charged successfully',
      resourceType: 'Payment',
      resourceId: payment._id,
      amount: payment.amount,
      currency: payment.currency,
      cardLast4: payment.cardLast4,
      result: 'success'
    });
    
    res.json(payment);
  } catch (error) {
    // Log failure
    await logAudit(req, 'payment', 'PAYMENT_FAILED', {
      description: 'Payment processing failed',
      result: 'failure',
      errorMessage: error.message,
      securityFlag: true
    });
    
    res.status(400).json({ error: error.message });
  }
});

// Log patient data access
router.get('/api/patients/:id', requireAuth, async (req, res) => {
  const patient = await User.findById(req.params.id);
  
  // Log that medical records were accessed
  await logDataAccess(req, 'Patient', req.params.id, [
    'medicalHistory',
    'appointmentHistory',
    'medications'
  ]);
  
  res.json(patient);
});

// Log data modification
router.put('/api/patients/:id', requireAuth, async (req, res) => {
  const before = await User.findById(req.params.id);
  const after = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  
  // Log what changed
  const changes = {
    emailChanged: before.email !== after.email,
    phoneChanged: before.phone !== after.phone,
    medicalHistoryUpdated: before.medicalHistory !== after.medicalHistory
  };
  
  await logDataModification(req, 'Patient', req.params.id, changes);
  
  res.json(after);
});

// Log security events
router.post('/api/auth/login', async (req, res) => {
  const failures = await lookupFailureCount(req.ip);
  
  if (failures > 5) {
    // Alert admin about suspicious activity
    await logSecurityEvent(req, 'SUSPICIOUS_LOGIN_ATTEMPTS', 
      'multiple_failed_attempts', 'high');
    
    return res.status(429).json({ error: 'Too many attempts' });
  }
  
  // ... login logic
});
```

### Querying Audit Logs

```javascript
const AuditLog = require('../models/AuditLog');

// Get user's action history
const history = await AuditLog.getUserHistory(userId);

// Find flagged/suspicious activities
const suspicious = await AuditLog.findSuspiciousActivity();

// Get audit trail for a specific resource
const trail = await AuditLog.getResourceAudit('Payment', paymentId);

// Find all payment-related actions
const payments = await AuditLog.find({
  category: 'payment',
  createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
}).lean();
```

### Audit Log Schema

| Field | Purpose | Example |
|-------|---------|---------|
| `userId` | Who made the action | ObjectId |
| `userRole` | Role at time of action | 'patient', 'staff', 'admin' |
| `category` | Type of action | 'auth', 'payment', 'data' |
| `action` | Specific action | 'LOGIN_SUCCESS', 'PAYMENT_PROCESSED' |
| `resourceType` | What was affected | 'Payment', 'Patient' |
| `resourceId` | ID of affected resource | ObjectId |
| `result` | Success/failure | 'success', 'failure' |
| `containsSensitiveData` | Was PHI/PII accessed? | true/false |
| `sensitiveFields` | Which sensitive fields | ['ssn', 'medicalHistory'] |
| `securityFlag` | Was this flagged? | true/false |
| `severity` | Alert severity | 'low', 'medium', 'high', 'critical' |

---

## 3. Field-Level Encryption

### Purpose
Encrypts sensitive data at rest in MongoDB using AES-256-CBC.

### Features
- Unique IV (initialization vector) per record
- Safe for indexed fields (hash-based indexing)
- Easy decrypt/retrieve helpers
- Automatic key validation

### Usage in Models

```javascript
const { encryptionFieldHelper } = require('../utils/encryption');

// In your schema
const patientSchema = new mongoose.Schema({
  name: String,
  
  // Encrypted field for medical notes
  medicalNotes: {
    iv: String,
    encrypted: String
  },
  
  // Encrypted SSN
  socialSecurityNumber: {
    iv: String,
    encrypted: String
  }
});

// When saving encrypted data
patientSchema.pre('save', function(next) {
  if (this.isModified('medicalNotes') && this.medicalNotes) {
    this.medicalNotes = encryptionFieldHelper.store(this.medicalNotes);
  }
  next();
});

// When retrieving - automatic with getter
patientSchema.virtual('medicalNotesDecrypted').get(function() {
  return encryptionFieldHelper.retrieve(this.medicalNotes);
});

// Usage
const patient = new Patient();
patient.medicalNotes = "Patient has diabetes..."; // Automatically encrypted on save
await patient.save();

// Decrypt when needed
const decrypted = patient.medicalNotesDecrypted; // Returns plaintext
```

### Direct Usage

```javascript
const { encrypt, decrypt } = require('./utils/encryption');

// Encrypt a value
const sensitiveData = "SSN: 123-45-6789";
const { iv, encrypted } = encrypt(sensitiveData);

// Store in DB:
await User.create({
  ssn: { iv, encrypted }
});

// Decrypt when needed
const plaintext = decrypt(encrypted, iv);
```

---

## 4. HTTPS Enforcement

### For Development
Leave HTTPS disabled (default):
```env
HTTPS_ENABLED=false
NODE_ENV=development
```

### For Production
1. Get SSL certificates (Let's Encrypt, AWS, etc.)
2. Update .env:
```env
HTTPS_ENABLED=true
NODE_ENV=production
HTTPS_KEY_PATH=/etc/ssl/private/private.key
HTTPS_CERT_PATH=/etc/ssl/certs/certificate.crt
```

3. Server automatically:
   - Loads certificates
   - Creates HTTPS server
   - Sets HSTS headers
   - Enforces secure cookies

---

## 5. Compliance Checklist

### HIPAA (Healthcare Data)
- ✅ Audit logs all access to patient records
- ✅ Encryption of medical data in transit & at rest
- ✅ Access control (patient/staff/admin roles)
- ❌ TODO: Add data retention/deletion policies

### PCI-DSS (Payment Card Data)
- ✅ Card tokens encrypted via Cybersource
- ✅ No raw card numbers stored
- ✅ Payment transactions signed with HMAC
- ✅ Rate limiting on payment endpoints
- ✅ Audit logs for all payment operations
- ✅ HTTPS/TLS support

---

## 6. Troubleshooting

### "Cannot start server with missing secrets"
- Check all required keys in .env
- Generate missing encryption keys using command above
- Verify key format (hex strings with correct length)

### "Decryption failed: Unsupported state or unable to decrypt"
- IV or encrypted data corrupted in database
- Different encryption key used

### "Missing DATA_ENCRYPTION_KEY"
- Generate new key and add to .env
- Only affects new encryptions (old data still uses previous key)

---

## 7. Security Best Practices

### Secrets Management
- ✅ Never commit .env to git
- ✅ Use different keys for dev/staging/production
- ✅ Rotate encryption keys every 90 days (configure in .env)
- ✅ Store keys in secure vaults (AWS Secrets Manager, HashiCorp Vault)

### Audit Logs
- ✅ Review daily for security alerts
- ✅ Keep for 1+ year (HIPAA requires 6 years)
- ✅ Backup immutable copies
- ✅ Monitor failed login attempts

### Data Access
- ✅ Encrypt all sensitive fields
- ✅ Use role-based access control
- ✅ Log all PHI/PII access
- ✅ Minimize data in memory

### Incident Response
- ✅ Check audit logs for breach timeline
- ✅ Review suspicious activities
- ✅ Analyze which data was accessed
- ✅ Notify affected users per HIPAA

---

## 8. Monitoring Dashboard (Recommended)

```javascript
// Create a route to show security status
router.get('/api/admin/security-status', requireAdmin, async (req, res) => {
  const suspicious = await AuditLog.findSuspiciousActivity(10);
  const failedLogins = await AuditLog.find({
    category: 'auth',
    result: 'failure',
    createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
  }).count();
  
  const paymentAudits = await AuditLog.find({
    category: 'payment',
    createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
  }).countDocuments();
  
  res.json({
    suspiciousActivities: suspicious.length,
    failedLogins24h: failedLogins,
    paymentTransactions24h: paymentAudits,
    systemStatus: 'healthy'
  });
});
```

---

## Summary

Your data protection system now includes:

| Component | Status | Impact |
|-----------|--------|--------|
| Secrets Validation | ✅ Implemented | Prevents misconfiguration |
| Audit Logging | ✅ Implemented | HIPAA/PCI compliance + forensics |
| Field Encryption | ✅ Implemented | Data protection at rest |
| HTTPS Support | ✅ Ready | Secure data in transit |
| Rate Limiting | ✅ Active | DDoS/brute force protection |
| Input Validation | ✅ Active | Injection attack prevention |

**Next Steps:** Review audit logs daily and establish regular security audits.
