const crypto = require('crypto');

/**
 * ============================================================
 * PAYMENT TOKENIZATION MODULE
 * ============================================================
 * 
 * Handles encryption/decryption of Cybersource tokens
 * Uses AES-256-CBC with unique IVs for each token
 * Ensures PCI-DSS compliance (never store raw card data)
 */

// Constants
const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';
const IV_LENGTH = 16; // 128 bits for AES

/**
 * ============================================================
 * TOKEN ENCRYPTION
 * ============================================================
 */

/**
 * Encrypt a Cybersource token using AES-256-CBC
 * @param {String} token - Token to encrypt
 * @param {String} encryptionKey - 32-byte hex encryption key
 * @returns {Object} { encryptedToken, iv }
 */
function encryptToken(token, encryptionKey) {
  try {
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }

    if (!encryptionKey || typeof encryptionKey !== 'string') {
      throw new Error('Encryption key is required');
    }

    // Validate key length (32 bytes = 64 hex chars)
    if (encryptionKey.length !== 64) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters)');
    }

    // Generate unique IV for this token
    const iv = crypto.randomBytes(IV_LENGTH);

    // Convert key from hex to buffer
    const keyBuffer = Buffer.from(encryptionKey, ENCODING);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);

    return {
      encryptedToken: encrypted,
      iv: iv.toString(ENCODING)
    };
  } catch (error) {
    throw new Error(`Failed to encrypt token: ${error.message}`);
  }
}

/**
 * Decrypt a Cybersource token
 * @param {String} encryptedToken - Encrypted token from database
 * @param {String} iv - Initialization vector (hex string)
 * @param {String} encryptionKey - 32-byte hex encryption key
 * @returns {String} Decrypted token
 */
function decryptToken(encryptedToken, iv, encryptionKey) {
  try {
    if (!encryptedToken || typeof encryptedToken !== 'string') {
      throw new Error('Encrypted token must be a non-empty string');
    }

    if (!iv || typeof iv !== 'string') {
      throw new Error('IV is required');
    }

    if (!encryptionKey || typeof encryptionKey !== 'string') {
      throw new Error('Encryption key is required');
    }

    // Convert from hex
    const keyBuffer = Buffer.from(encryptionKey, ENCODING);
    const ivBuffer = Buffer.from(iv, ENCODING);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);

    // Decrypt
    let decrypted = decipher.update(encryptedToken, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt token: ${error.message}`);
  }
}

/**
 * ============================================================
 * ENCRYPTION KEY MANAGEMENT
 * ============================================================
 */

/**
 * Generate a new encryption key
 * Should only be used during setup
 * @returns {String} 32-byte random key in hex format
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString(ENCODING);
}

/**
 * Validate encryption key format
 * @param {String} key - Key to validate
 * @returns {Boolean} True if valid
 */
function isValidEncryptionKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Should be 32-byte hex (64 characters)
  if (key.length !== 64) {
    return false;
  }

  // Should only contain hex characters
  return /^[a-f0-9]{64}$/i.test(key);
}

/**
 * ============================================================
 * TOKEN HASHING (for indexing without exposing token)
 * ============================================================
 */

/**
 * Create a SHA-256 hash of the token for database indexing
 * Allows fast lookups without storing the token in plain
 * @param {String} token - Token to hash
 * @returns {String} Hash in hex format
 */
function hashToken(token) {
  try {
    if (!token) {
      throw new Error('Token is required');
    }

    return crypto
      .createHash('sha256')
      .update(String(token))
      .digest(ENCODING);
  } catch (error) {
    throw new Error(`Failed to hash token: ${error.message}`);
  }
}

/**
 * Verify a token matches a hash
 * @param {String} token - Token to verify
 * @param {String} hash - Expected hash
 * @returns {Boolean} True if token matches hash
 */
function verifyTokenHash(token, hash) {
  try {
    if (!token || !hash) {
      return false;
    }

    const tokenHash = hashToken(token);
    
    // Timing-safe comparison
    const tokenBuffer = Buffer.from(tokenHash, ENCODING);
    const expectedBuffer = Buffer.from(hash, ENCODING);

    if (tokenBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * ============================================================
 * TOKEN LIFECYCLE MANAGEMENT
 * ============================================================
 */

/**
 * Calculate expiration time for a token
 * @param {Number} ttlHours - Time to live in hours (default: 24)
 * @returns {Date} Expiration datetime
 */
function calculateExpirationTime(ttlHours = 24) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);
  return expiresAt;
}

/**
 * Check if token has expired
 * @param {Date} expiresAt - Expiration time
 * @returns {Boolean} True if expired
 */
function isTokenExpired(expiresAt) {
  if (!expiresAt) {
    return false;
  }

  return new Date() > new Date(expiresAt);
}

/**
 * Check if token expires soon (within days)
 * @param {Date} expiresAt - Expiration time
 * @param {Number} daysThreshold - Days threshold (default: 7)
 * @returns {Boolean} True if expires soon
 */
function tokenExpiresSoon(expiresAt, daysThreshold = 7) {
  if (!expiresAt) {
    return false;
  }

  const now = new Date();
  const expiryDate = new Date(expiresAt);
  const timeUntilExpiry = expiryDate - now;
  const daysUntilExpiry = timeUntilExpiry / (1000 * 60 * 60 * 24);

  return daysUntilExpiry > 0 && daysUntilExpiry <= daysThreshold;
}

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

/**
 * Validate card expiry is in future
 * @param {Number} expiryMonth - Month (1-12)
 * @param {Number} expiryYear - Year (YYYY)
 * @returns {Boolean} True if card not expired
 */
function isCardValid(expiryMonth, expiryYear) {
  if (!expiryMonth || !expiryYear) {
    return false;
  }

  // Card expires at end of month
  const expiryDate = new Date(expiryYear, expiryMonth, 0); // 0 = last day of previous month
  
  return new Date() <= expiryDate;
}

/**
 * Validate card will expires soon
 * @param {Number} expiryMonth - Month (1-12)
 * @param {Number} expiryYear - Year (YYYY)
 * @param {Number} warningDays - Days before expiry to warn (default: 30)
 * @returns {Boolean} True if expiring soon
 */
function cardExpiresSoon(expiryMonth, expiryYear, warningDays = 30) {
  if (!expiryMonth || !expiryYear) {
    return false;
  }

  const expiryDate = new Date(expiryYear, expiryMonth, 0);
  const now = new Date();
  const timeUntilExpiry = expiryDate - now;
  const daysUntilExpiry = timeUntilExpiry / (1000 * 60 * 60 * 24);

  return daysUntilExpiry > 0 && daysUntilExpiry <= warningDays;
}

/**
 * Format card expiry for display
 * @param {Number} month - Month
 * @param {Number} year - Year
 * @returns {String} Formatted expiry (MM/YY)
 */
function formatCardExpiry(month, year) {
  if (!month || !year) {
    return '';
  }

  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year).slice(-2); // Last 2 digits

  return `${monthStr}/${yearStr}`;
}

/**
 * ============================================================
 * TOKEN METADATA EXTRACTION
 * ============================================================
 */

/**
 * Extract safe display info from encrypted token data
 * Never returns sensitive information
 * @param {Object} tokenData - Token document from database
 * @returns {Object} Safe display information
 */
function getTokenDisplayInfo(tokenData) {
  if (!tokenData) {
    return null;
  }

  return {
    id: tokenData._id,
    cardLast4: tokenData.cardLast4,
    cardBrand: tokenData.cardBrand,
    expiryMonth: tokenData.expiryMonth,
    expiryYear: tokenData.expiryYear,
    expiryFormatted: formatCardExpiry(tokenData.expiryMonth, tokenData.expiryYear),
    isExpired: isTokenExpired(tokenData.expiresAt),
    tokenExpiresSoon: tokenExpiresSoon(tokenData.expiresAt),
    cardExpiresSoon: cardExpiresSoon(tokenData.expiryMonth, tokenData.expiryYear),
    isActive: tokenData.tokenStatus === 'active',
    isDefault: tokenData.isDefault,
    createdAt: tokenData.createdAt,
    lastUsedAt: tokenData.lastUsedAt
  };
}

/**
 * ============================================================
 * AUDIT LOGGING
 * ============================================================
 */

/**
 * Create audit log for token operations
 * Never log the actual token or decrypted data
 */
function createTokenAuditLog(operation, tokenId, result) {
  return {
    timestamp: new Date().toISOString(),
    operation, // encrypt, decrypt, validate, revoke, etc.
    tokenId,
    result, // success, failed, error
    details: {
      // No sensitive data
    }
  };
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  // Encryption/Decryption
  encryptToken,
  decryptToken,

  // Key management
  generateEncryptionKey,
  isValidEncryptionKey,

  // Token hashing
  hashToken,
  verifyTokenHash,

  // Lifecycle
  calculateExpirationTime,
  isTokenExpired,
  tokenExpiresSoon,

  // Validation
  isCardValid,
  cardExpiresSoon,
  formatCardExpiry,

  // Display
  getTokenDisplayInfo,

  // Audit
  createTokenAuditLog,

  // Constants
  ALGORITHM,
  ENCODING,
  IV_LENGTH
};
