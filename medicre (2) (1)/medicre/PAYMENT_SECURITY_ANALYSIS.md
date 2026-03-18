# Payment Gateway Security Analysis - Cybersource Integration

**Document**: Comprehensive security requirements analysis before implementing payment processing  
**Date**: March 14, 2026  
**Status**: ANALYSIS PHASE - DO NOT IMPLEMENT PAYMENTS YET

---

## EXECUTIVE SUMMARY

Your hospital management system currently has **MODERATE** baseline security but **CRITICAL GAPS** exist for payment processing. Cybersource integration requires strict compliance with 4 security domains. **Failure to implement these properly will result in account suspension and potential data breaches.**

**Overall Readiness: 35% - Major work required before payment gateway activation**

---

## CURRENT SYSTEM SECURITY AUDIT

### ✅ IMPLEMENTED PROTECTIONS
| Feature | Status | Details |
|---------|--------|---------|
| HTTP Security Headers | ✅ | Helmet.js installed, securing headers |
| MongoDB Injection Prevention | ✅ | express-mongo-sanitize active |
| Rate Limiting | ✅ | 15 min window, 100 req/IP |
| Authentication | ✅ | Token-based sessions, SHA256 hashing |
| Password Security | ✅ | Scrypt hashing with salt |
| Request Logging | ✅ | Morgan integrated for audit trail |
| Basic Input Sanitization | ⚠️ | Partial - XSS-clean dependency unused |

### ❌ CRITICAL GAPS FOR PAYMENT PROCESSING
| Feature | Missing | Impact |
|---------|---------|--------|
| HMAC-SHA256 Request Signing | ❌ | Cannot prevent transaction tampering |
| Response Signature Validation | ❌ | Cannot verify Cybersource authenticity |
| 3D Secure (3DS) Integration | ❌ | No fraud chargeback protection |
| Payment Tokenization (TMS) | ❌ | **ILLEGAL** - risking account suspension |
| CSRF Protection | ❌ | Cross-site request forgery vulnerability |
| Comprehensive Input Validation | ❌ | Cannot enforce payment field rules |
| Webhook Security (MERCHANT POST) | ❌ | Cannot securely receive transaction results |
| AVS/CVN Checks | ❌ | Cannot verify card holder identity |

---

## 4 CRITICAL SECURITY PILLARS

### 1️⃣ DIGITAL INTEGRITY & TAMPER PROTECTION

**Purpose**: Prevent malicious actors from altering payment data during transmission

#### A. HMAC-SHA256 Request Signing

```
Every transaction request must be digitally signed before sending to Cybersource
```

**What to sign:**
- ✅ Amount
- ✅ Currency
- ✅ Transaction type
- ✅ Merchant ID
- ✅ Customer email
- ✅ Invoice reference
- ❌ DO NOT sign: Card numbers, CVN, customer input fields

**Implementation Requirements:**
1. Generate HMAC-SHA256 using Secret Key
2. Append signature to request header: `X-HMAC-Signature`
3. Must be signed server-side ONLY
4. Secret Key must NEVER be in frontend code

**Code Structure Needed:**
```javascript
// backend/payments/security.js
function signPaymentRequest(requestFields, secretKey) {
  // Create HMAC-SHA256
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(JSON.stringify(sortedFields));
  return hmac.digest('hex');
}

function verifyPaymentResponse(responseData, providedSignature, secretKey) {
  const expectedSignature = signPaymentRequest(responseData, secretKey);
  return crypto.timingSafeEqual(
    Buffer.from(providedSignature),
    Buffer.from(expectedSignature)
  );
}
```

**Risk if Not Implemented:**
- 🔴 Attackers modify amount (e.g., $5,000 → $50)
- 🔴 Attackers change currency (USD → BDT)
- 🔴 Attackers redirect funds to different patient

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

#### B. Secure Key Management

```
Secret Key is your most critical asset - treat like password
```

**Rules:**
1. ❌ NEVER hardcode Secret Key in source code
2. ❌ NEVER commit to Git (add to .gitignore)
3. ❌ NEVER log or print Secret Key
4. ❌ NEVER send to frontend
5. ✅ Store only in `.env` file (server-side)
6. ✅ Generate with `crypto.randomBytes(32)`
7. ✅ Rotate every 90 days
8. ✅ Use different keys for dev/staging/production

**Implementation:**
```bash
# Generate new Secret Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
CYBERSOURCE_SECRET_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

### 2️⃣ FRAUD PREVENTION & MITIGATION

**Purpose**: Protect against unauthorized transactions and chargebacks

#### A. 3D Secure (3DS) Authentication

```
Extra layer: Customer authenticates with their bank during payment
```

**How it works:**
1. Customer clicks "Pay Now"
2. Redirected to bank authentication page
3. Enters OTP/password from their bank
4. Bank confirms cardholder identity
5. Transaction proceeds with bank guarantee

**Benefits:**
- ✅ Reduces fraud by 98%
- ✅ Protects you from chargebacks (bank liability)
- ✅ Supports both 3DS v1.0 and v2.0

**Requirements:**
- Implement 3DS redirect flow in payment form
- Handle post-authentication callback
- Store 3DS verification status in transaction record

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

#### B. AVS & CVN Checks

```
Verify the person paying is the actual cardholder
```

| Check | Purpose | Risk |
|-------|---------|------|
| **AVS** (Address Verification System) | Matches billing address with card issuer records | Card stolen but address different |
| **CVN** (Card Verification Number) | Verifies 3/4-digit security code | Skimmed card without CVV |

**Automatic Reversal Logic:**
```javascript
// If AVS or CVN fails
if (avsResult === 'DECLINE' || cvnResult === 'DECLINE') {
  // 1. IMMEDIATELY reverse authorization
  reversalAmount = authorizedAmount;
  releaseCustomerFunds();
  
  // 2. Flag transaction
  markTransactionAsDeclined();
  
  // 3. Notify customer & doctor
  sendPaymentFailedEmail();
}
```

**Implementation Requirements:**
1. Collect billing address (not PII, just for verification)
2. Validate format before sending to Cybersource
3. Compare AVS/CVN responses
4. Auto-reverse on mismatch
5. Log reason for decline

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

#### C. Decision Manager (Fraud Scoring)

```
Cybersource's AI automatically screens every transaction for risk
```

**Workflow:**
```
Transaction → Decision Manager → Risk Score (0-100)
                                 ├─ Low Risk (0-30) → Auto-approve
                                 ├─ Medium Risk (31-70) → Review needed
                                 └─ High Risk (71-100) → Auto-decline
```

**Your Responsibilities:**
1. Enable Decision Manager in Cybersource console
2. Configure risk thresholds
3. Create admin dashboard to review flagged transactions
4. Implement notification system for high-risk payments
5. Add manual review approval workflow

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

### 3️⃣ INFRASTRUCTURE & WEB SECURITY

**Purpose**: Protect payment system from hackers exploiting web vulnerabilities

#### A. CSRF Protection

```
Prevent attackers from tricking users into making unauthorized payments
```

**Attack Scenario:**
```
1. Patient logs into your hospital system
2. Attacker tricks them to click malicious link
3. Malicious form auto-submits payment request
4. Money charged without patient consent
```

**Prevention - Synchronizer Token Pattern:**
```javascript
// 1. Generate unique token per session
app.get('/api/payment-form', requireAuth, (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = csrfToken;
  res.json({ csrfToken });
});

// 2. Require token in payment submission
app.post('/api/payment', requireAuth, (req, res) => {
  if (req.body.csrfToken !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  // Process payment
});
```

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

#### B. XSS & CSRF Protection

**XSS (Cross-Site Scripting):**
- ✅ Helmet already enabled
- ⚠️ Need comprehensive output encoding

**Input Validation:**
```javascript
// Validate ALL payment inputs before processing
const paymentSchema = {
  amount: { type: 'number', min: 0, max: 999999 },
  currency: { type: 'string', enum: ['USD', 'LKR'] },
  invoiceRef: { type: 'string', pattern: /^[A-Z0-9\-]{1,50}$/ },
  customerEmail: { type: 'email', required: true },
  billingAddress: { type: 'string', maxLength: 200 },
  // NEVER include: patientId, medicalRecord, SSN
};
```

**Status**: ⚠️ PARTIALLY IMPLEMENTED (Helmet exists, needs validation schema)

---

#### C. Encrypted Webhook Handler

```
Cybersource sends payment results via HTTPS POST to your server
This must be encrypted and verified
```

**Endpoint Requirements:**
1. ✅ HTTPS only (TLS 1.2+)
2. ✅ POST method (never GET)
3. ✅ Verify Cybersource signature in webhook
4. ✅ Idempotent (handle duplicate notifications)
5. ✅ Return 200 OK to Cybersource quickly
6. ✅ Process async to avoid timeouts

**Implementation:**
```javascript
// backend/payments/webhookHandler.js

app.post('/api/payments/webhook', (req, res) => {
  try {
    // 1. Verify signature immediately
    const signature = req.headers['x-cybersource-signature'];
    const isValid = verifyCybersourceSignature(req.body, signature);
    
    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // 2. Quick response to Cybersource
    res.status(200).json({ received: true });
    
    // 3. Process async (don't block)
    processPaymentWebhook(req.body);
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Processing error' });
  }
});
```

**Status**: ⚠️ NEEDS IMPLEMENTATION

---

#### D. Iframe Clickjacking Prevention

**If embedding payment form in iframe:**

```javascript
// Set headers to prevent framing
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  // or 'SAMEORIGIN' if you embed in your own domain
  next();
});

// Prevent double-framing
// Do NOT embed payment form in nested iframes
```

**Status**: ℹ️ ALREADY COVERED by Helmet

---

### 4️⃣ COMPLIANCE & SENSITIVE DATA HANDLING

**Purpose**: Meet Cybersource compliance requirements and PCI-DSS standards

#### ⚠️ CRITICAL: PII RESTRICTIONS

```
Failure to comply = IMMEDIATE ACCOUNT SUSPENSION
```

**🔴 YOU CANNOT DO THIS:**
```javascript
// ILLEGAL - violates Cybersource TOS
const paymentData = {
  patientId: "P12345",        // ❌ PII - Account suspended!
  medicalRecord: "Surgery",   // ❌ PII - Account suspended!
  ssn: "123-45-6789",         // ❌ PII - Account suspended!
  nationalId: "123456789V",   // ❌ PII - Account suspended!
};

// WRONG - using merchant-defined fields for PII
merchantDefinedData: {
  patientId: "P12345",        // ❌ Cybersource can detect this
  diagnosis: "COVID-19",      // ❌ Violation
}
```

**✅ YOU MUST DO THIS:**
```javascript
// LEGAL - using only allowed fields
const paymentData = {
  amount: 5000,                              // ✅ Allowed
  currency: "LKR",                           // ✅ Allowed
  invoiceReference: "INV-2024-001",         // ✅ Allowed
  customerEmail: "patient@example.com",     // ✅ Allowed
  cardToken: "nBxSNh7OGQAeSaSdGqUdNBxS", // ✅ Token (never card #)
  billingAddress: "123 Main St, City, ZIP", // ✅ For AVS only
};

// Merchant-defined fields can only contain non-PII:
merchantDefinedData: {
  appointmentType: "follow-up",             // ✅ Allowed (non-PII)
  department: "cardiology",                 // ✅ Allowed (non-PII)
}
```

**The Solution: Token Management Service (TMS)**

#### Payment Tokenization

```
Replace credit card data with unique, encrypted tokens
Cybersource stores the card → You get a token → Use token for future charges
```

**Flow:**
```
1. Patient enters card details in secure Cybersource form
2. Cybersource returns unique TOKEN (e.g., "token_abc123xyz")
3. You store the TOKEN in your database (encrypted)
4. For future charges, use TOKEN instead of card number
5. Patient never enters card details again
```

**Benefits:**
- ✅ Never store credit card numbers
- ✅ Complies with PCI-DSS (reduced scope)
- ✅ Automatic account compliance
- ✅ Reusable for follow-up appointments
- ✅ Meets Cybersource requirements

**Implementation Required:**
```javascript
// backend/payments/models/PaymentToken.js
const tokenSchema = new Schema({
  patientId: ObjectId,
  cybersourceToken: String,        // Encrypted token from Cybersource
  cardLast4: String,               // Only last 4 digits (not PII)
  cardBrand: String,               // Visa, MasterCard, etc
  expiryMonth: Number,
  expiryYear: Number,
  tokenStatus: String,             // active, expired, revoked
  createdAt: Date,
  expiresAt: Date,                 // TTL: 24 hours
  lastUsedAt: Date,
});

// When processing payment:
const token = await PaymentToken.findById(tokenId);
const payment = await chargeCybersource({
  amount: 5000,
  token: token.cybersourceToken,   // Use token, not card
});
```

**Token Lifecycle:**
```
Token Created → Valid for 24 hours → Auto-expire
               ↓
          Can be reused for multiple charges
               ↓
          Patient can revoke manually
               ↓
          Admin can revoke (refund/cancel)
```

**Status**: 🔴 CRITICAL - NOT IMPLEMENTED

---

## IMPLEMENTATION ROADMAP

### Priority 1: CRITICAL (Do First - Without these, do NOT go live)

#### Week 1: Security Foundation
- [ ] **Task 1.1**: Create `backend/payments/security.js`
  - HMAC-SHA256 signing functions
  - Request verification functions
  - Key management utilities
  - **Estimate**: 4 hours

- [ ] **Task 1.2**: Create CSRF protection middleware
  - Token generation & validation
  - Session storage
  - Route protection
  - **Estimate**: 3 hours

- [ ] **Task 1.3**: Comprehensive input validation
  - Create `backend/middleware/validation.js`
  - Define payment schema (joi)
  - Validate all endpoints
  - **Estimate**: 5 hours

#### Week 2: Payment Infrastructure
- [ ] **Task 2.1**: Payment tokenization system
  - Create `PaymentToken` model
  - Token encryption/decryption
  - Token lifecycle management
  - **Estimate**: 6 hours

- [ ] **Task 2.2**: Webhook handler
  - Create `backend/payments/webhookHandler.js`
  - Signature verification
  - Transaction recording
  - **Estimate**: 4 hours

- [ ] **Task 2.3**: Environment & Configuration
  - Add all required .env variables
  - Cybersource API client setup
  - TLS 1.2+ enforcement
  - **Estimate**: 2 hours

### Priority 2: HIGH (Required before launch)

#### Week 3-4: Fraud Prevention
- [ ] **Task 3.1**: 3D Secure (3DS) integration
  - Frontend redirect flow
  - Backend verification
  - Testing with Cybersource sandbox
  - **Estimate**: 8 hours

- [ ] **Task 3.2**: AVS/CVN checks
  - Billing address validation
  - Auto-reversal logic
  - Decline handling
  - **Estimate**: 5 hours

- [ ] **Task 3.3**: Decision Manager integration
  - Risk scoring configuration
  - Admin dashboard for flagged transactions
  - Notification system
  - **Estimate**: 6 hours

### Priority 3: MEDIUM (Before production)

- [ ] **Task 4.1**: Logging & Audit Trail
  - Payment transaction logging
  - Security event tracking
  - Compliance reporting
  - **Estimate**: 4 hours

- [ ] **Task 4.2**: Testing & Validation
  - Unit tests for signing functions
  - Integration tests with Cybersource sandbox
  - Penetration testing
  - **Estimate**: 8 hours

- [ ] **Task 4.3**: Documentation
  - Payment API documentation
  - Security guidelines for developers
  - Incident response procedures
  - **Estimate**: 3 hours

---

## REQUIRED DEPENDENCIES

```bash
npm install joi               # Input validation schema
npm install helmet-csp        # Content Security Policy
npm install express-validator # Additional validation
npm install jsonwebtoken      # Token management
npm install dotenv            # Already installed
```

---

## NEW ENVIRONMENT VARIABLES

```bash
# Cybersource Configuration
CYBERSOURCE_ENABLED=false              # Start as false

# API Credentials (from Cybersource dashboard)
CYBERSOURCE_API_KEY=your_api_key_here
CYBERSOURCE_SECRET_KEY=your_secret_key_here  # 32-byte hex
CYBERSOURCE_MERCHANT_ID=your_merchant_id
CYBERSOURCE_ENVIRONMENT=sandbox        # sandbox or production

# Payment Configuration
PAYMENT_ENABLED=false                  # Enable only after security audit
PAYMENT_CURRENCY=LKR
PAYMENT_MIN_AMOUNT=100
PAYMENT_MAX_AMOUNT=999999

# Token Management
PAYMENT_TOKEN_ENCRYPTION_KEY=32_byte_hex_key
PAYMENT_TOKEN_TTL_HOURS=24
PAYMENT_TOKEN_ROTATION_DAYS=90

# Webhook Configuration
CYBERSOURCE_WEBHOOK_URL=https://yourdomain.com/api/payments/webhook
CYBERSOURCE_WEBHOOK_SECRET=webhook_signature_key

# Security
CSRF_TOKEN_TTL_MINUTES=60
FRAUD_RISK_THRESHOLD=70              # 0-100 (Decision Manager)
AUTO_REVERSAL_ENABLED=true

# Logging
PAYMENT_AUDIT_LOG=true
SECURITY_ALERT_EMAIL=admin@hospital.com
```

---

## SECURITY CHECKLIST BEFORE LAUNCH

- [ ] HMAC signing implemented & tested
- [ ] Response signature validation working
- [ ] CSRF protection middleware active
- [ ] Input validation schema enforced
- [ ] Payment tokenization active (no card storage)
- [ ] Webhook handler encrypted & verified
- [ ] 3D Secure redirects working
- [ ] AVS/CVN checks implemented
- [ ] Auto-reversal tested
- [ ] Audit logging enabled
- [ ] HTTPS/TLS 1.2+ enforced
- [ ] All secrets in .env (never in code)
- [ ] Cybersource sandbox testing complete
- [ ] Security audit by external firm (recommended)
- [ ] Compliance checklist signed by admin
- [ ] Incident response plan documented

---

## RISK MATRIX

| Risk | Probability | Impact | Status |
|------|-------------|--------|--------|
| Transaction tampering (no HMAC) | HIGH | CRITICAL | ⚠️ |
| Card data stored locally | MEDIUM | CRITICAL | 🔴 |
| Account suspension (PII violation) | MEDIUM | CRITICAL | 🔴 |
| Fraud/unauthorized transactions | HIGH | HIGH | ⚠️ |
| CSRF attacks | MEDIUM | HIGH | ⚠️ |
| Data breach (no encryption) | MEDIUM | CRITICAL | ⚠️ |
| XSS injection in payment form | LOW | HIGH | ✅ (Helmet) |

---

## NEXT STEPS

**DO NOT implement payment processing until security audit is complete.**

1. **Review this document** with your development team
2. **Create security task board** in your project management tool
3. **Assign Priority 1 tasks** to developers
4. **Set up Cybersource sandbox account** for testing
5. **Schedule weekly security reviews** with team
6. **Plan external security audit** (recommend after Priority 2 completion)
7. **Document all decisions** for compliance

---

**Document Created**: March 14, 2026  
**Review Interval**: Every 2 weeks during implementation  
**Compliance Standard**: PCI-DSS Level 2, Cybersource TOS
