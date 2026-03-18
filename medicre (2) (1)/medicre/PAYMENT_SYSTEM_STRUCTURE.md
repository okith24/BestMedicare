# Payment System - Directory Structure & File Organization

## New Folder Structure to Create

```
backend/
├── payments/                          # NEW: Payment processing module
│   ├── security.js                    # HMAC signing, verification
│   ├── tokenization.js                # Token encryption/decryption
│   ├── webhookHandler.js              # Cybersource webhook receiver
│   ├── fraudManager.js                # Decision Manager integration
│   ├── constants.js                   # API constants, error codes
│   │
│   ├── models/
│   │   ├── Payment.js                 # Payment transaction schema
│   │   ├── PaymentToken.js            # Encrypted card tokens
│   │   ├── PaymentRefund.js           # Refund tracking
│   │   └── PaymentAudit.js            # Compliance audit logs
│   │
│   ├── routes/
│   │   ├── paymentRoutes.js           # POST /api/payments/charge
│   │   ├── tokenRoutes.js             # POST /api/payments/tokenize
│   │   └── webhookRoutes.js           # POST /api/payments/webhook
│   │
│   └── tests/
│       ├── security.test.js           # Test HMAC signing
│       ├── tokenization.test.js       # Test encryption
│       └── webhook.test.js            # Test webhook verification
│
├── middleware/                         # NEW: Enhanced security
│   ├── csrf.js                        # CSRF protection
│   ├── validation.js                  # Payment input validation
│   ├── paymentAuth.js                 # Payment-specific auth
│   └── errorHandler.js                # Secure error responses
│
├── config/
│   └── cybersource.js                 # Cybersource API client (NEW)
│   └── db.js                          # Existing (keep as is)
│
├── auth/
│   ├── middleware.js                  # Existing
│   ├── security.js                    # Existing
│   └── ... (existing auth files)
│
├── services/
│   ├── smsGateway.js                  # Existing
│   └── paymentService.js              # NEW: Payment biz logic
│
└── .env                               # NEW: Payment env vars
```

---

## FILE CREATION CHECKLIST

### Phase 1: Core Security Files (Week 1)

- [ ] **backend/payments/security.js** (120 lines)
  - `signRequest()` - HMAC-SHA256 signing
  - `verifyResponse()` - Response verification
  - `createSecureKey()` - Key generation helper

- [ ] **backend/middleware/csrf.js** (80 lines)
  - `generateCSRFToken()` - Create token
  - `validateCSRFToken()` - Verify token
  - CSRF middleware for Express

- [ ] **backend/middleware/validation.js** (150 lines)
  - Payment schema validation
  - Input sanitization
  - Field-specific rules

- [ ] **backend/payments/constants.js** (60 lines)
  - Cybersource API endpoints
  - Error codes
  - Response status mappings

- [ ] **backend/config/cybersource.js** (100 lines)
  - API client initialization
  - Request formatting
  - Error handling

### Phase 2: Token Management (Week 2)

- [ ] **backend/payments/models/PaymentToken.js** (80 lines)
  - Schema definition
  - Encryption/decryption methods
  - Validation

- [ ] **backend/payments/tokenization.js** (120 lines)
  - `encryptToken()` - AES-256 encryption
  - `decryptToken()` - Token decryption
  - `createPaymentToken()` - New token creation
  - `validateToken()` - Check expiry/status

- [ ] **backend/payments/models/Payment.js** (100 lines)
  - Payment transaction record
  - Status tracking
  - Audit fields

- [ ] **backend/payments/webhookHandler.js** (150 lines)
  - `POST /api/payments/webhook`
  - Signature verification
  - Transaction recording
  - Idempotency handling

### Phase 3: API Routes (Week 2-3)

- [ ] **backend/payments/routes/paymentRoutes.js** (100 lines)
  - `POST /api/payments/charge` - Process payment
  - `GET /api/payments/:id` - Get payment status
  - `POST /api/payments/:id/refund` - Refund payment

- [ ] **backend/payments/routes/tokenRoutes.js** (80 lines)
  - `POST /api/payments/tokens` - Create token
  - `GET /api/payments/tokens` - List tokens
  - `DELETE /api/payments/tokens/:id` - Revoke token

- [ ] **backend/payments/routes/webhookRoutes.js** (60 lines)
  - `POST /api/payments/webhook` - Cybersource notification

### Phase 4: Fraud Prevention (Week 3-4)

- [ ] **backend/payments/fraudManager.js** (200 lines)
  - Decision Manager integration
  - Risk scoring
  - Auto-reversal logic
  - Fraud alert notifications

- [ ] **backend/payments/models/PaymentAudit.js** (80 lines)
  - Compliance audit logs
  - Security event tracking

- [ ] **backend/middleware/paymentAuth.js** (60 lines)
  - Payment-specific auth checks
  - Rate limiting for payment endpoints

### Phase 5: Testing & Documentation

- [ ] **backend/payments/tests/security.test.js**
  - HMAC signing tests
  - Signature verification tests

- [ ] **backend/payments/tests/tokenization.test.js**
  - Encryption/decryption tests
  - Token lifecycle tests

- [ ] **backend/payments/tests/webhook.test.js**
  - Webhook signature verification
  - Transaction recording tests

---

## ENVIRONMENT VARIABLES TO ADD

Create/update `.env` file:

```bash
# ============== CYBERSOURCE CONFIGURATION ==============
CYBERSOURCE_ENABLED=false
CYBERSOURCE_API_KEY=your_api_key
CYBERSOURCE_SECRET_KEY=your_secret_key_hex
CYBERSOURCE_MERCHANT_ID=your_merchant_id
CYBERSOURCE_ENVIRONMENT=sandbox

# ============== PAYMENT CONFIGURATION ==============
PAYMENT_ENABLED=false
PAYMENT_CURRENCY=LKR
PAYMENT_MIN_AMOUNT=100
PAYMENT_MAX_AMOUNT=999999

# ============== TOKEN ENCRYPTION ==============
PAYMENT_TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key
PAYMENT_TOKEN_ENCRYPTION_ALGORITHM=aes-256-cbc
PAYMENT_TOKEN_TTL_HOURS=24
PAYMENT_TOKEN_ROTATION_DAYS=90

# ============== SECURITY ==============
CSRF_TOKEN_TTL_MINUTES=60
CSRF_COOKIE_SECURE=true
CSRF_COOKIE_HTTPONLY=true

# ============== WEBHOOK ==============
CYBERSOURCE_WEBHOOK_URL=https://yourdomain.com/api/payments/webhook
CYBERSOURCE_WEBHOOK_SECRET=webhook_secret_key

# ============== FRAUD PREVENTION ==============
DECISION_MANAGER_ENABLED=true
FRAUD_RISK_THRESHOLD=70
AUTO_REVERSAL_ENABLED=true

# ============== LOGGING ==============
PAYMENT_AUDIT_LOG=true
SECURITY_ALERT_EMAIL=admin@hospital.com
PAYMENT_LOG_LEVEL=info
```

**Important**: Add to `.gitignore`:
```
.env
.env.local
.env.*.local
```

---

## FILE DEPENDENCIES

### Files that depend on `backend/payments/security.js`:
- `backend/payments/webhookHandler.js`
- `backend/payments/routes/paymentRoutes.js`
- Tests

### Files that depend on `backend/payments/tokenization.js`:
- `backend/payments/models/PaymentToken.js`
- `backend/payments/routes/tokenRoutes.js`
- `backend/payments/routes/paymentRoutes.js`

### Files that depend on `backend/middleware/csrf.js`:
- `backend/server.js` (register middleware)
- Payment routes (use in POST handlers)

### Files that depend on `backend/middleware/validation.js`:
- Payment routes
- Webhook handler

### Files that depend on `backend/config/cybersource.js`:
- `backend/payments/routes/paymentRoutes.js`
- `backend/payments/fraudManager.js`
- `backend/payments/tokenization.js`

---

## IMPORT STRUCTURE

### server.js (Root Backend File)

```javascript
// Add these imports:
const csrf = require('./middleware/csrf');
const validation = require('./middleware/validation');
const paymentAuth = require('./middleware/paymentAuth');

// Register payment routes:
const paymentRoutes = require('./payments/routes/paymentRoutes');
const tokenRoutes = require('./payments/routes/tokenRoutes');
const webhookRoutes = require('./payments/routes/webhookRoutes');

// Apply CSRF middleware to all routes
app.use(csrf.csrfProtection);

// Register payment endpoints
app.use('/api/payments', paymentAuth, paymentRoutes);
app.use('/api/payments', paymentAuth, tokenRoutes);
app.use('/api/payments/webhook', webhookRoutes);  // Public, no auth
```

---

## TESTING STRUCTURE

```
backend/payments/tests/
├── security.test.js
├── tokenization.test.js
├── webhook.test.js
└── fixtures/
    ├── validPayment.json
    ├── cybersourceResponse.json
    └── webhookPayload.json
```

**Run tests:**
```bash
npm test
# or
npm run test:payments
```

---

## DATABASE MIGRATIONS NEEDED

```javascript
// Create these collections in MongoDB

// Collection: paymenttokens
db.createCollection('paymenttokens', {
  validator: {
    $jsonSchema: {
      required: ['cybersourceToken', 'patientId', 'tokenStatus'],
      properties: {
        cybersourceToken: { type: 'string' },
        patientId: { type: 'objectId' },
        cardLast4: { type: 'string' },
        cardBrand: { type: 'string' },
        tokenStatus: { enum: ['active', 'expired', 'revoked'] },
        expiresAt: { type: 'date' },
        createdAt: { type: 'date' }
      }
    }
  }
});

// Collection: payments
db.createCollection('payments', {
  validator: {
    $jsonSchema: {
      required: ['amount', 'status', 'patientId'],
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
        status: { enum: ['pending', 'authorized', 'captured', 'failed', 'refunded'] },
        patientId: { type: 'objectId' },
        invoiceRef: { type: 'string' },
        cybersourceRef: { type: 'string' },
        tokenId: { type: 'objectId' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' }
      }
    }
  }
});

// Create indexes
db.paymenttokens.createIndex({ patientId: 1, tokenStatus: 1 });
db.paymenttokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.payments.createIndex({ patientId: 1, createdAt: -1 });
db.payments.createIndex({ cybersourceRef: 1 });
db.payments.createIndex({ status: 1 });
```

---

## NEXT STEP IMMEDIATELY

1. **Create the folder structure** (just directories, no files yet)
2. **Add environment variables** to .env file
3. **Install dependencies**:
   ```bash
   npm install joi helmet-csp express-validator
   ```
4. **Start with Phase 1 files** (security.js, csrf.js, validation.js)
5. **Test each file** before moving to next phase

---

**Keep this file as reference during implementation**

Last Updated: March 14, 2026
