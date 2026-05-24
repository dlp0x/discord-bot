import logger from '#shared/logging/logger.js';

class SecureLogger {
  constructor () {
    this.knownTokens = new Set();
    this.securityLevel = 'medium';
    this.securityContext = {
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV === 'development',
      isTest: process.env.NODE_ENV === 'test'
    };

    this.replacements = {
      token: '[TOKEN_MASQUÉ]',
      email: '[EMAIL_MASQUÉ]',
      ip: '[IP_MASQUÉE]',
      password: '[MOT_DE_PASSE_MASQUÉ]',
      discordId: '[DISCORD_ID]',
      url: '[URL_MASQUÉE]',
      privateKey: '[CLÉ_PRIVÉE_MASQUÉE]'
    };

    this.patterns = {
      token: /\b[a-zA-Z0-9_-]{20,}\b/g,
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
      password: /(?:password|pwd|passwd)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
      privateKey: /-----BEGIN[\s\S]+?PRIVATE KEY-----/g,
      ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      urlWithToken: /https?:\/\/[^\s]*token=[^\s&]+/gi,
      discordId: /\b\d{17,19}\b/g,
      dangerousHtml: /on\w+\s*=|<script|javascript:/gi
    };
  }

  setSecurityLevel (level) {
    this.securityLevel = level;
  }

  getSecurityContext () {
    return this.securityContext;
  }

  getMaskingStats () {
    return {
      securityLevel: this.securityLevel,
      patternsCount: Object.keys(this.patterns).length,
      knownTokensCount: this.knownTokens.size
    };
  }

  maskSensitiveData (text, _level = this.securityLevel, options = {}) {
    if (typeof text !== 'string') return text;

    let out = text;

    out = out.replace(this.patterns.urlWithToken, this.replacements.url);
    out = out.replace(this.patterns.email, this.replacements.email);
    out = out.replace(this.patterns.password, this.replacements.password);
    out = out.replace(this.patterns.privateKey, this.replacements.privateKey);

    if (options.maskIds) {
      out = out.replace(this.patterns.discordId, this.replacements.discordId);
    }

    if (this.securityContext.isProduction || options.maskIps) {
      out = out.replace(this.patterns.ip, this.replacements.ip);
    }

    out = out.replace(this.patterns.token, (m) => {
      if (this.knownTokens.has(m)) return this.replacements.token;
      if (m.length >= 20) return this.replacements.token;
      return m;
    });

    return out;
  }

  maskObject (obj, levelOrContext = {}, maybeContext = {}) {
    const context = typeof levelOrContext === 'string' ? maybeContext : levelOrContext;

    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map((v) => this.maskObject(v, context));
    }

    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      const maskedKey = this.maskSensitiveData(key, this.securityLevel, context);
      if (typeof value === 'string') {
        out[maskedKey] = this.maskSensitiveData(value, this.securityLevel, context);
      } else if (value && typeof value === 'object') {
        out[maskedKey] = this.maskObject(value, context);
      } else {
        out[maskedKey] = value;
      }
    }

    return out;
  }

  isSensitive (text) {
    if (typeof text !== 'string') return false;
    return /token|password|secret/i.test(text) || this.patterns.email.test(text);
  }

  addKnownToken (token) {
    this.knownTokens.add(token);
  }

  removeKnownToken (token) {
    this.knownTokens.delete(token);
  }

  log (level, message, data = null, context = {}) {
    const safeMessage = this.maskSensitiveData(message, this.securityLevel, context);
    const safeData = data ? this.maskObject(data, context) : null;

    switch (level) {
      case 'error':
        logger.error(safeMessage, safeData);
        break;
      case 'warn':
        logger.warn(safeMessage, safeData);
        break;
      case 'debug':
        logger.debug(safeMessage, safeData);
        break;
      default:
        logger.info(safeMessage, safeData);
        break;
    }
  }

  secureLog (level, message, data, context) {
    return this.log(level, message, data, context);
  }

  secureSecurityAlert (type, details) {
    return this.log('warn', `[SECURITY] ${type}`, details);
  }

  secureError (msg, err, ctx) {
    return this.log('error', msg, { error: err }, ctx);
  }
}

const secureLogger = new SecureLogger();

export const maskSensitiveData = (...args) => secureLogger.maskSensitiveData(...args);
export const secureLog = (...args) => secureLogger.log(...args);
export const secureError = (msg, err, ctx) => secureLogger.log('error', msg, { error: err }, ctx);
export const secureAudit = (action, userId, details) => secureLogger.log('info', `[AUDIT] ${action}`, { userId, details }, { maskIds: true });
export const secureSecurityAlert = (type, details) => secureLogger.secureSecurityAlert(type, details);
export const securePerformance = (op, duration, details) => secureLogger.log('info', `[PERF] ${op} ${duration}ms`, details);

export { secureLogger };
export default secureLogger;
