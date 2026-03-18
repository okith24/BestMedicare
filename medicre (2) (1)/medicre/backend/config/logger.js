/**
 * Centralized logging utility for the application
 * Provides consistent logging across all modules
 */

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

// Get current log level from environment
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

/**
 * Format timestamp for logs
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Write log to file
 */
function writeToFile(level, message, meta = {}) {
  try {
    const logFile = path.join(logsDir, `${level.toLowerCase()}-${getDateString()}.log`);
    const logEntry = JSON.stringify({
      timestamp: getTimestamp(),
      level,
      message,
      ...meta
    });
    fs.appendFileSync(logFile, logEntry + '\n');
  } catch (err) {
    console.error('Error writing to log file:', err.message);
  }
}

/**
 * Get date string for log file naming (YYYY-MM-DD)
 */
function getDateString() {
  const date = new Date();
  return date.toISOString().split('T')[0];
}

/**
 * Console output with colors
 */
function consoleLog(level, message, meta = {}) {
  const timestamp = getTimestamp();
  const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  
  const colors = {
    DEBUG: '\x1b[36m', // Cyan
    INFO: '\x1b[32m',  // Green
    WARN: '\x1b[33m',  // Yellow
    ERROR: '\x1b[31m', // Red
    CRITICAL: '\x1b[35m' // Magenta
  };
  const reset = '\x1b[0m';
  
  console.log(`${colors[level]}[${timestamp}] ${level}:${reset} ${message}${metaStr}`);
}

/**
 * Main logger object
 */
const logger = {
  debug: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      consoleLog('DEBUG', message, meta);
      writeToFile('DEBUG', message, meta);
    }
  },

  info: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
      consoleLog('INFO', message, meta);
      writeToFile('INFO', message, meta);
    }
  },

  warn: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
      consoleLog('WARN', message, meta);
      writeToFile('WARN', message, meta);
    }
  },

  error: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      consoleLog('ERROR', message, meta);
      writeToFile('ERROR', message, meta);
    }
  },

  critical: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.CRITICAL) {
      consoleLog('CRITICAL', message, meta);
      writeToFile('CRITICAL', message, meta);
    }
  },

  audit: (action, user, description, meta = {}) => {
    const auditEntry = {
      action,
      user,
      description,
      timestamp: getTimestamp(),
      ...meta
    };
    consoleLog('AUDIT', `${action} by ${user}: ${description}`, meta);
    writeToFile('AUDIT', `${action} by ${user}: ${description}`, meta);
  },

  security: (eventType, severity, description, meta = {}) => {
    const securityEntry = {
      eventType,
      severity,
      description,
      timestamp: getTimestamp(),
      ...meta
    };
    consoleLog(severity, `SECURITY EVENT [${eventType}]: ${description}`, meta);
    writeToFile('SECURITY', `${eventType} (${severity}): ${description}`, meta);
  }
};

module.exports = logger;
