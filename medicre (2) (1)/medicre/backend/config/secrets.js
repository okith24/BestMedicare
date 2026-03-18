/**
 * ============================================================
 * SECRETS VALIDATION & MANAGEMENT
 * ============================================================
 * 
 * Validates all critical environment variables are loaded
 * Prevents server startup if sensitive configs are missing
 * Implements secret rotation best practices
 */

const requiredSecrets = {
  // Database
  MONGO_URI: {
    required: true,
    type: 'string',
    description: 'MongoDB Atlas connection string'
  },

  // Payment Processing (Cybersource)
  CYBERSOURCE_API_KEY: {
    required: true,
    type: 'string',
    description: 'Cybersource API key for payment processing'
  },
  CYBERSOURCE_SECRET_KEY: {
    required: true,
    type: 'string',
    description: 'Cybersource secret key (64 hex chars minimum)'
  },
  CYBERSOURCE_MERCHANT_ID: {
    required: true,
    type: 'string',
    description: 'Cybersource merchant ID'
  },
  CYBERSOURCE_WEBHOOK_SECRET: {
    required: true,
    type: 'string',
    description: 'Secret for verifying Cybersource webhooks'
  },

  // Encryption
  PAYMENT_TOKEN_ENCRYPTION_KEY: {
    required: true,
    type: 'string',
    minLength: 64,
    description: 'AES-256 encryption key (32 bytes = 64 hex chars)'
  },

  // Security
  JWT_SECRET: {
    required: false,
    type: 'string',
    minLength: 32,
    description: 'Secret for JWT signing (if using JWT)'
  },

  // SMS Gateway
  SMS_API_KEY: {
    required: process.env.SMS_ENABLED === 'true',
    type: 'string',
    description: 'API key for SMS gateway'
  }
};

/**
 * Validate all required secrets are present and properly formatted
 */
function validateSecrets() {
  const errors = [];
  const warnings = [];

  Object.entries(requiredSecrets).forEach(([key, config]) => {
    const value = process.env[key];

    // Check if required
    if (config.required && !value) {
      errors.push(`❌ CRITICAL: Missing required secret: ${key} - ${config.description}`);
    }

    // Validate type
    if (value && config.type === 'string' && typeof value !== 'string') {
      errors.push(`❌ Invalid type for ${key}: expected string, got ${typeof value}`);
    }

    // Validate minimum length
    if (value && config.minLength && value.length < config.minLength) {
      errors.push(`❌ ${key} is too short. Required minimum: ${config.minLength} chars, got ${value.length}`);
    }

    // Warning: Production should not have sample keys
    if (value && (value.includes('sandbox') || value.includes('your_') || value === 'demo')) {
      warnings.push(`⚠️  WARNING: ${key} appears to be a placeholder/test value. Update for production!`);
    }
  });

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.HTTPS_ENABLED && process.env.HTTPS_ENABLED !== 'false') {
      warnings.push('⚠️  HTTPS not explicitly enabled. Set HTTPS_ENABLED=true for production');
    }

    if (!process.env.CSRF_COOKIE_SECURE || process.env.CSRF_COOKIE_SECURE !== 'true') {
      errors.push('❌ CSRF_COOKIE_SECURE must be true in production');
    }

    if (!process.env.CSRF_COOKIE_HTTPONLY || process.env.CSRF_COOKIE_HTTPONLY !== 'true') {
      errors.push('❌ CSRF_COOKIE_HTTPONLY must be true in production');
    }
  }

  // Report results
  if (warnings.length > 0) {
    console.warn('\n' + '='.repeat(60));
    console.warn('SECURITY WARNINGS:');
    warnings.forEach(w => console.warn(w));
    console.warn('='.repeat(60) + '\n');
  }

  if (errors.length > 0) {
    console.error('\n' + '='.repeat(60));
    console.error('CONFIGURATION ERRORS:');
    errors.forEach(e => console.error(e));
    console.error('='.repeat(60) + '\n');
    throw new Error('Cannot start server with missing or invalid secrets. See errors above.');
  }

  console.log('✅ All required secrets validated successfully\n');
}

/**
 * Get a secret safely with optional default
 */
function getSecret(key, defaultValue = null) {
  const value = process.env[key];
  if (!value && defaultValue === null) {
    throw new Error(`Missing required secret: ${key}`);
  }
  return value || defaultValue;
}

/**
 * Check if secret exists
 */
function hasSecret(key) {
  return !!process.env[key];
}

/**
 * Mark a secret as needing rotation
 * For security audits and compliance
 */
function shouldRotateSecret(key, lastRotatedDate, rotationIntervalDays = 90) {
  if (!lastRotatedDate) return true;

  const daysSinceRotation = Math.floor(
    (Date.now() - new Date(lastRotatedDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysSinceRotation > rotationIntervalDays;
}

module.exports = {
  validateSecrets,
  getSecret,
  hasSecret,
  shouldRotateSecret,
  requiredSecrets
};
