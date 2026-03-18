# PAYMENT GATEWAY SECURITY - QUICK REFERENCE GUIDE

## ⚡ KEY TAKEAWAYS

### 1. DO NOT SKIP SECURITY
- **NO SHORTCUT**: All 4 security pillars are REQUIRED before launch
- **NOT OPTIONAL**: Cybersource will audit and suspend non-compliant accounts
- **NOT LATER**: Retroactive security fixes are expensive and risky

### 2. YOUR BIGGEST RISKS (Today)

| Risk | Why Critical | Fix Timeline |
|------|-------------|--------------|
| **No HMAC Signing** | Attackers can modify payment amounts in transit | Week 1 |
| **No Token Encryption** | Storing card numbers = account suspension | Week 2 |
| **No CSRF Protection** | Hackers trick users into paying via malicious links | Week 1 |
| **No 3D Secure** | Chargebacks = money lost to your hospital | Week 3 |
| **No Webhook Verification** | Fake payments recorded as valid | Week 2 |

### 3. WHAT MUST BE IN PLACE BEFORE FIRST PAYMENT

**These 5 things are blocking:**

```
1. ✓ HMAC-SHA256 signing/verification working
2. ✓ Payment tokens in use (no card numbers stored)
3. ✓ CSRF token validation active
4. ✓ Input validation enforcing payment rules
5. ✓ Webhook signature verification implemented
```

Without all 5 → **Cannot process payments securely → DO NOT GO LIVE**

### 4. ILLEGAL ACTIONS (Will Trigger Account Suspension)

```javascript
// ❌ NEVER do this:
const paymentRequest = {
  amount: 5000,
  patientId: "P12345",           // ILLEGAL! PII violation
  department: "cardiology",
  medicalRecord: "...",          // ILLEGAL!
  ssn: "123-45-6789",            // ILLEGAL!
  cardNumber: "4111111111111111" // ILLEGAL!
};

// ✅ DO THIS instead:
const paymentRequest = {
  amount: 5000,
  customerEmail: "patient@example.com",
  cardToken: "token_abc123xyz",           // From Cybersource TMS
  invoiceRef: "INV-2024-001",
  // Only: amount, currency, token, email, address (for AVS)
};
```

### 5. IMPLEMENTATION PHILOSOPHY

**Security First, Features Later**

- Complete ALL security work before adding features
- Test everything with Cybersource sandbox first
- Never use production keys during development
- Rotate secrets every 90 days
- Audit logs are your insurance policy

---

## 📋 SECURITY REQUIREMENTS BY PILLAR

### 1️⃣ DIGITAL INTEGRITY

**Must Implement:**
- [ ] HMAC-SHA256 request signing (crypto.createHmac)
- [ ] Response signature validation
- [ ] Secret Key in .env (never in code)
- [ ] Timing-safe comparison for signatures

**Result**: Attackers cannot tamper with payments in transit

---

### 2️⃣ FRAUD PREVENTION

**Must Implement:**
- [ ] 3D Secure redirect flow (customer bank authentication)
- [ ] AVS checks (billing address verification)
- [ ] CVN checks (card security code)
- [ ] Automatic authorization reversals

**Result**: 98% reduction in fraud, chargebacks covered by bank

---

### 3️⃣ INFRASTRUCTURE SECURITY

**Must Implement:**
- [ ] CSRF token validation (double-submit pattern)
- [ ] Input validation schema (joi/zod)
- [ ] HTTPS/TLS 1.2+ enforcement
- [ ] Encrypted webhook handler
- [ ] XSS/injection prevention (Helmet already done)

**Result**: Protection against automated hacking tools

---

### 4️⃣ COMPLIANCE & DATA

**MUST DO - No Exceptions:**
- [ ] **Use payment tokens** (TMS) - never store card numbers
- [ ] **Block PII in payment fields** - validate schema
- [ ] **Encrypt token storage** - AES-256
- [ ] **Never log sensitive fields** - scrub logs
- [ ] **Audit trail** - every transaction recorded

**Result**: PCI-DSS compliant, Cybersource approved, patient data safe

---

## 🔧 QUICK IMPLEMENTATION TASKS

### Task: Add HMAC Signing (3-4 hours)

```javascript
// backend/payments/security.js
const crypto = require('crypto');

function signRequest(fields, secretKey) {
  const sortedFields = Object.keys(fields)
    .sort()
    .reduce((obj, key) => {
      obj[key] = fields[key];
      return obj;
    }, {});
  
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(JSON.stringify(sortedFields));
  return hmac.digest('hex');
}

function verifyResponse(data, signature, secretKey) {
  const expectedSig = signRequest(data, secretKey);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSig, 'hex')
  );
}

module.exports = { signRequest, verifyResponse };
```

### Task: Add CSRF Protection (2-3 hours)

```javascript
// backend/middleware/csrf.js
const crypto = require('crypto');

function generateCSRFToken(req) {
  const token = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = token;
  return token;
}

function validateCSRFToken(req) {
  const headerToken = req.body.csrfToken || req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;
  
  if (!headerToken || !sessionToken) return false;
  
  return crypto.timingSafeEqual(
    Buffer.from(headerToken),
    Buffer.from(sessionToken)
  );
}

module.exports = { generateCSRFToken, validateCSRFToken };
```

### Task: Add Payment Tokens (5-6 hours)

```javascript
// backend/payments/models/PaymentToken.js
const tokenSchema = new Schema({
  patientId: mongoose.Types.ObjectId,
  cybersourceToken: { type: String, required: true, unique: true },
  cardLast4: String,        // Only last 4 digits
  cardBrand: String,        // Visa, MC, Amex
  tokenStatus: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active'
  },
  expiresAt: Date,          // Auto-expire after 24h
  createdAt: { type: Date, default: Date.now }
});

// When patient pays, use token instead of card:
const token = await PaymentToken.findById(tokenId);
const payment = await cyberSource.charge({
  amount: 5000,
  token: token.cybersourceToken,  // Use this, not card #
});
```

---

## 🚨 COMPLIANCE CHECKLIST

Before going to production:
- [ ] No credit card numbers in database (use tokens)
- [ ] No PII in merchant-defined fields (validate schema)
- [ ] No card data in logs (scrub sensitive fields)
- [ ] HMAC signing & verification working
- [ ] CSRF protection active on all payment endpoints
- [ ] 3D Secure configured in Cybersource console
- [ ] Webhook URL registered (HTTPS required)
- [ ] Audit logs enabled and tested
- [ ] Secrets in .env (never in git)
- [ ] TLS 1.2+ enforced
- [ ] External security audit completed

---

## 🔐 SECRET MANAGEMENT

### Don't Do This ❌
```javascript
// ❌ WRONG - Secret in code
const secretKey = "a1b2c3d4e5f6g7h8";
app.post('/payment', (req, res) => {
  const sig = crypto.createHmac('sha256', secretKey);
});

// ❌ WRONG - Secret in git
// git commit .env
```

### Do This ✅
```javascript
// ✅ RIGHT - Secret in .env
// .env file (add to .gitignore)
CYBERSOURCE_SECRET_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

// ✅ RIGHT - Load in code
const secretKey = process.env.CYBERSOURCE_SECRET_KEY;
if (!secretKey) throw new Error('Secret key not configured');

app.post('/payment', (req, res) => {
  const sig = crypto.createHmac('sha256', secretKey);
});
```

### Generate New Secret Key
```bash
# Run this command
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy output to .env:
# CYBERSOURCE_SECRET_KEY=<output>
```

---

## 📞 WHEN TO CONTACT CYBERSOURCE SUPPORT

**Contact them for:**
- Setting up Decision Manager
- Configuring webhook endpoints
- Enabling 3D Secure
- Testing sandbox transactions
- Moving to production

**They provide:**
- Sandbox environment for testing
- Production API credentials
- Technical documentation
- Compliance certification

---

## 🎯 SUCCESS CRITERIA

After completing this security review:

1. **Week 1**: HMAC + CSRF + Validation + Webhooks working
2. **Week 2**: Tokens implemented, no card numbers stored
3. **Week 3-4**: 3DS + AVS/CVN + Decision Manager active
4. **Week 5**: Complete security audit passed
5. **Week 6**: First test transaction in sandbox
6. **Week 7**: Production deployment approved

---

## 📚 RESOURCES

- [Cybersource API Reference](https://documentation.cybersource.com/)
- [PCI-DSS Compliance Guide](https://www.pcisecuritystandards.org/)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [OWASP Security Guidelines](https://owasp.org/)

---

**Last Updated**: March 14, 2026  
**Status**: Under Development  
**Next Review**: March 21, 2026
