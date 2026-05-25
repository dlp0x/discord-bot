// ========================================
// core/utils/secureLogger.js - version simplifiée
// ========================================

import logger from '#shared/logging/logger.js';

class SecureLogger {
  constructor () {
    this.knownTokens = new Set();

    this.securityContext = {
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV === 'development',
      isTest: process.env.NODE_ENV === 'test'
    };

    this.levels = ['error', 'warn', 'info', 'debug'];

    this.replacements = {
      token: '[TOKEN_MASQUÉ]',
      email: '[EMAIL_MASQUÉ]',
      ip: '[IP_MASQUÉE]',
      password: '[MOT_DE_PASSE_MASQUÉ]',
      discordId: '[DISCORD_ID]'
    };

    this.patterns = {
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
      password: /(?:password|pwd|passwd)[\s:=]+[^\s'"]+/gi,
      privateKey: /-----BEGIN[\s\S]+?PRIVATE KEY-----/g,
      ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
    };
  }

  // =========================
  // ENTRY POINT UNIQUE
  // =========================
  log (level, message, data = null, context = {}) {
    const safeMessage = this.mask(message, context);
    const safeData = data ? this.maskObject(data, context) : null;

    const finalMessage = this.isSensitive(message)
      ? `[SECURE] ${safeMessage}`
      : safeMessage;

    this.dispatch(level, finalMessage, safeData);
  }

  // =========================
  // DISPATCH VERS LOGGER
  // =========================
  dispatch (level, message, data) {
    switch (level) {
      case 'error':
        return logger.error(message, data);
      case 'warn':
        return logger.warn(message, data);
      case 'debug':
        return logger.debug(message, data);
      case 'info':
      default:
        return logger.info(message, data);
    }
  }

  // =========================
  // MASK STRING
  // =========================
  mask (text, context = {}) {
    if (typeof text !== 'string') return text;

    let out = text;

    // emails
    out = out.replace(this.patterns.email, this.replacements.email);

    // passwords
    out = out.replace(this.patterns.password, '[PASSWORD_MASQUÉ]');

    // IPs (prod only)
    if (this.securityContext.isProduction) {
      out = out.replace(this.patterns.ip, this.replacements.ip);
    }

    // private keys
    out = out.replace(this.patterns.privateKey, '[CLÉ_PRIVÉE_MASQUÉE]');

    // discord IDs context-aware
    if (context.maskIds) {
      out = out.replace(/\b\d{17,19}\b/g, this.replacements.discordId);
    }

    return out;
  }

  // =========================
  // MASK OBJECT RECURSIF
  // =========================
  maskObject (obj, context = {}) {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(v => this.maskObject(v, context));
    }

    const out = {};

    for (const [key, value] of Object.entries(obj)) {
      const k = this.mask(key, context);

      let v = value;

      if (typeof v === 'string') {
        v = this.mask(v, context);
      } else if (typeof v === 'object') {
        v = this.maskObject(v, context);
      }

      out[k] = v;
    }

    return out;
  }

  // =========================
  // DETECTION SIMPLE
  // =========================
  isSensitive (text) {
    if (typeof text !== 'string') return false;

    return (
      text.includes('token') ||
      text.includes('password') ||
      text.includes('secret') ||
      this.patterns.email.test(text)
    );
  }

  // =========================
  // TOKENS CONNUS
  // =========================
  addKnownToken (token) {
    this.knownTokens.add(token);
  }

  removeKnownToken (token) {
    this.knownTokens.delete(token);
  }
}

// singleton
const secureLogger = new SecureLogger();

// =========================
// EXPORT SIMPLE API
// =========================

export function secureLog (level, message, data, context) {
  return secureLogger.log(level, message, data, context);
}

export function secureError (msg, err, ctx) {
  return secureLogger.log('error', msg, { error: err }, ctx);
}

export function secureAudit (action, userId, details) {
  return secureLogger.log('info', `[AUDIT] ${action}`, {
    userId,
    details
  }, { maskIds: true });
}

export function secureSecurityAlert (type, details) {
  return secureLogger.log('warn', `[SECURITY] ${type}`, details);
}

export function securePerformance (op, duration, details) {
  return secureLogger.log('info', `[PERF] ${op} ${duration}ms`, details);
}

export default secureLogger;