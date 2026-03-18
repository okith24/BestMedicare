const crypto = require('crypto');

/**
 * ============================================================
 * DATA ENCRYPTION UTILITIES - FIELD-LEVEL ENCRYPTION
 * ============================================================
 * 
 * Encrypts sensitive fields at rest
 * Uses AES-256-CBC with unique IVs per record
 * Separate from password hashing (uses scrypt)
 * 
 * Fields encrypted:
 * - Medical history / notes
 * - Patient contact details (optional)
 * - Payment-related metadata
 */

const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';
const KEY_SIZE = 32; // 256 bits for AES-256

/**
 * Get encryption key from environment
 */
function getEncryptionKey() {
  const keyEnv = process.env.DATA_ENCRYPTION_KEY;

  if (!keyEnv) {
    throw new Error(
      'DATA_ENCRYPTION_KEY not set. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const keyBuffer = Buffer.from(keyEnv, ENCODING);

  if (keyBuffer.length !== KEY_SIZE) {
    throw new Error(
      `Invalid DATA_ENCRYPTION_KEY length. Expected ${KEY_SIZE} bytes (${KEY_SIZE * 2} hex chars), ` +
      `got ${keyBuffer.length} bytes`
    );
  }

  return keyBuffer;
}

/**
 * Encrypt a value
 * @param {string} plaintext - Value to encrypt
 * @returns {object} { iv, encrypted } - Both in hex
 */
function encrypt(plaintext) {
  try {
    if (!plaintext) return null;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // Unique IV per encryption
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(String(plaintext), 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);

    return {
      iv: iv.toString(ENCODING),
      encrypted: encrypted
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt a value
 * @param {string} encrypted - Encrypted value (hex)
 * @param {string} iv - Initialization vector (hex)
 * @returns {string} Decrypted plaintext
 */
function decrypt(encrypted, iv) {
  try {
    if (!encrypted || !iv) return null;

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, ENCODING)
    );

    let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Get/set encrypted field helper
 * Usage: Instead of directly storing, use encryption
 */
const encryptionFieldHelper = {
  /**
   * Store encrypted in schema
   * Usage: model.medicalNotes = encryptionFieldHelper.store(plaintext)
   */
  store(plaintext) {
    if (!plaintext) return null;
    return encrypt(plaintext);
  },

  /**
   * Retrieve decrypted value
   * Usage: const plaintext = encryptionFieldHelper.retrieve(model.medicalNotes)
   */
  retrieve(encryptedData) {
    if (!encryptedData || !encryptedData.iv || !encryptedData.encrypted) {
      return null;
    }
    return decrypt(encryptedData.encrypted, encryptedData.iv);
  }
};

/**
 * Hash value for indexing encrypted fields
 * Allows searching encrypted data without exposing plaintext
 * 
 * Usage:
 * 1. Store hash separately for indexing
 * 2. Search by hash, get encrypted record
 * 3. Decrypt only the found record
 */
function hashForIndexing(plaintext) {
  return crypto
    .createHash('sha256')
    .update(String(plaintext || ''))
    .digest('hex');
}

/**
 * Generate secure random token
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString(ENCODING);
}

/**
 * Validate encryption key format
 */
function validateEncryptionKeyFormat(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Key must be a string' };
  }

  if (key.length !== 64) {
    return { valid: false, error: `Key must be 64 hex characters, got ${key.length}` };
  }

  try {
    Buffer.from(key, ENCODING);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Key must be valid hex string' };
  }
}

/**
 * Rotate encryption key (for security updates)
 * Decrypts with old key, re-encrypts with new key
 */
async function rotateEncryptionKey(collection, oldKey, newKey, fieldsToRotate = []) {
  // This would need to:
  // 1. Validate both keys
  // 2. Decrypt all documents with old key
  // 3. Re-encrypt with new key
  // 4. Only call this during maintenance window
  throw new Error('Key rotation must be implemented in migration script');
}

module.exports = {
  encrypt,
  decrypt,
  encryptionFieldHelper,
  hashForIndexing,
  generateSecureToken,
  getEncryptionKey,
  validateEncryptionKeyFormat,
  rotateEncryptionKey,
  ALGORITHM,
  KEY_SIZE
};
