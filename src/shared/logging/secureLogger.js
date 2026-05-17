// ========================================
// core/utils/secureLogger.js - Système de logging sécurisé optimisé
// ========================================

import logger from '#shared/logging/logger.js';

/**
 * Classe de logging sécurisé avec masquage intelligent des données sensibles
 */
class SecureLogger {
  constructor () {
    // Patterns pour détecter les données sensibles
    this.sensitivePatterns = [
      // Tokens Discord (seulement si pas dans .env)
      /(?:token|api_key|secret)[\s]*[:=][\s]*['"]?([a-zA-Z0-9._-]{20,})['"]?/gi,
      // Discord IDs (17-19 chiffres) - seulement dans certains contextes
      /(\d{17,19})/g,
      // Emails
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
      // URLs avec tokens
      /(https?:\/\/[^\s]+token[^\s]+)/gi,
      // IPs privées
      /(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)\d{1,3}\.\d{1,3}/g,
      // Mots de passe
      /(?:password|passwd|pwd)[\s]*[:=][\s]*['"]?([^\s'"]+)['"]?/gi,
      // Clés privées
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi
    ];

    // Remplacements pour les données sensibles
    this.replacements = {
      token: '[TOKEN_MASQUÉ]',
      discordId: '[DISCORD_ID]',
      email: '[EMAIL_MASQUÉ]',
      url: '[URL_MASQUÉE]',
      ip: '[IP_MASQUÉE]',
      password: '[MOT_DE_PASSE_MASQUÉ]',
      privateKey: '[CLÉ_PRIVÉE_MASQUÉE]'
    };

    // Niveaux de sécurité
    this.securityLevels = {
      LOW: 'low', // Masque seulement les tokens et mots de passe
      MEDIUM: 'medium', // Masque tokens, IDs, emails
      HIGH: 'high' // Masque tout sauf les messages d'erreur
    };

    this.currentLevel = this.securityLevels.MEDIUM;

    // Contexte de sécurité
    this.securityContext = {
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment:
        process.env.NODE_ENV === 'development'
        || process.env.NODE_ENV === 'dev',
      isTest: process.env.NODE_ENV === 'test',
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    // Tokens connus (pour éviter de masquer les tokens de .env)
    this.knownTokens = new Set();
    if (process.env.DISCORD_TOKEN) {
      this.knownTokens.add(process.env.DISCORD_TOKEN);
    }
  }

  /**
   * Masquer les données sensibles de manière intelligente
   */
  maskSensitiveData (message, level = this.currentLevel, context = {}) {
    if (typeof message !== 'string') {
      return this.maskObject(message, level, context);
    }

    let masked = message;

    // Masquer les tokens Discord (toujours en production, sinon seulement si pas connu)
    masked = masked.replace(
      /(?:token|api_key|secret)[\s]*[:=][\s]*['"]?([a-zA-Z0-9._-]{20,})['"]?/gi,
      (match, token) => {
        // En production, toujours masquer
        if (this.securityContext.isProduction) {
          const prefix = match.substring(0, match.indexOf(token));
          return `${prefix}${this.replacements.token}`;
        }
        // En dev/test, ne pas masquer si c'est un token connu (du .env)
        if (this.knownTokens.has(token)) {
          return match;
        }
        const prefix = match.substring(0, match.indexOf(token));
        return `${prefix}${this.replacements.token}`;
      }
    );

    // Masquer les Discord IDs seulement dans certains contextes et avec une regex plus précise
    if (this.shouldMaskDiscordIds(context)) {
      // Regex plus précise pour les Discord IDs : doit être isolé ou dans un contexte spécifique
      masked = masked.replace(
        /(?<=\b(?:user|guild|channel|message|role)\s*(?:id|ID)?\s*[:=]?\s*)(\d{17,19})\b/gi,
        this.replacements.discordId
      );
      // Aussi masquer les IDs Discord dans les URLs ou patterns spécifiques
      masked = masked.replace(
        /(?<=\/users\/|\/guilds\/|\/channels\/|\/messages\/|\/roles\/)(\d{17,19})/gi,
        this.replacements.discordId
      );
    }

    // Masquer les emails seulement en production ou si demandé
    if (this.securityContext.isProduction || context.maskEmails) {
      masked = masked.replace(
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
        this.replacements.email
      );
    }

    // Masquer les URLs avec tokens
    masked = masked.replace(
      /(https?:\/\/[^\s]+token[^\s]+)/gi,
      this.replacements.url
    );

    // Masquer les IPs privées seulement en production
    if (this.securityContext.isProduction) {
      masked = masked.replace(
        /(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)\d{1,3}\.\d{1,3}/g,
        this.replacements.ip
      );
    }

    // Masquer les mots de passe
    masked = masked.replace(
      /(?:password|passwd|pwd)[\s]*[:=][\s]*['"]?([^\s'"]+)['"]?/gi,
      (match, pwd) => {
        const prefix = match.substring(0, match.indexOf(pwd));
        return `${prefix}${this.replacements.password}`;
      }
    );

    // Masquer les clés privées
    masked = masked.replace(
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
      this.replacements.privateKey
    );

    return masked;
  }

  /**
   * Déterminer si les Discord IDs doivent être masqués
   */
  shouldMaskDiscordIds (context) {
    // Si le niveau de sécurité est HIGH, toujours masquer
    if (this.currentLevel === this.securityLevels.HIGH) {
      return true;
    }

    // En développement, masquer seulement si demandé explicitement
    if (this.securityContext.isDevelopment && !context.maskIds) {
      return false;
    }

    // En production, toujours masquer
    if (this.securityContext.isProduction) {
      return true;
    }

    // En test, ne pas masquer pour faciliter le debugging sauf si demandé
    if (this.securityContext.isTest && !context.maskIds) {
      return false;
    }

    return context.maskIds || false;
  }

  /**
   * Masquer les données sensibles dans un objet
   */
  maskObject (obj, level = this.currentLevel, context = {}) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.maskSensitiveData(obj, level, context);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskObject(item, level, context));
    }

    if (typeof obj === 'object') {
      const masked = {};
      for (const [key, value] of Object.entries(obj)) {
        // Masquer les clés sensibles
        const maskedKey = this.maskSensitiveData(key, level, context);

        // Traitement spécial pour les valeurs sensibles
        let maskedValue = value;

        // Si c'est un token Discord (propriété 'token' ou valeur ressemblant à un token)
        if (
          key.toLowerCase() === 'token'
          || (typeof value === 'string' && (/^[a-zA-Z0-9._-]{20,}$/).test(value))
        ) {
          // En production, toujours masquer
          if (this.securityContext.isProduction) {
            maskedValue = this.replacements.token;
          } else {
            // En dev/test, ne pas masquer si c'est un token connu
            if (this.knownTokens.has(value)) {
              maskedValue = value;
            } else {
              maskedValue = this.replacements.token;
            }
          }
        }
        // Si c'est un Discord ID (propriété 'userId', 'guildId', etc. ou valeur numérique de 17-19 chiffres)
        else if (
          key.toLowerCase().includes('id')
          || (typeof value === 'string' && (/^\d{17,19}$/).test(value))
        ) {
          if (this.shouldMaskDiscordIds(context)) {
            maskedValue = this.replacements.discordId;
          } else {
            maskedValue = value;
          }
        }
        // Si c'est un email
        else if (
          typeof value === 'string'
          && (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/).test(value)
        ) {
          if (this.securityContext.isProduction || context.maskEmails) {
            maskedValue = this.replacements.email;
          } else {
            maskedValue = value;
          }
        }
        // Sinon, traiter récursivement
        else {
          maskedValue = this.maskObject(value, level, context);
        }

        masked[maskedKey] = maskedValue;
      }
      return masked;
    }

    return obj;
  }

  /**
   * Logger sécurisé avec masquage intelligent
   */
  secureLog (level, message, data = null, context = {}) {
    const maskedMessage = this.maskSensitiveData(
      message,
      this.currentLevel,
      context
    );
    const maskedData = data
      ? this.maskObject(data, this.currentLevel, context)
      : null;

    // Ajouter un marqueur de sécurité seulement si des données ont été masquées
    const hasMasking = this.containsSensitiveData(message);
    const secureMessage = hasMasking
      ? `[SECURE] ${maskedMessage}`
      : maskedMessage;

    switch (level.toLowerCase()) {
    case 'error':
      logger.error(secureMessage, maskedData);
      break;
    case 'warn':
      logger.warn(secureMessage, maskedData);
      break;
    case 'info':
      logger.info(secureMessage, maskedData);
      break;
    case 'debug':
      logger.debug(secureMessage, maskedData);
      break;
    default:
      logger.info(secureMessage, maskedData);
    }
  }

  /**
   * Logger d'erreur sécurisé
   */
  secureError (message, error = null, context = null) {
    const maskedMessage = this.maskSensitiveData(message, this.currentLevel, {
      maskIds: true
    });

    // Traitement spécial pour les objets Error
    let maskedError = null;
    if (error) {
      if (error instanceof Error) {
        // Préserver les propriétés importantes de l'Error
        maskedError = {
          name: error.name,
          message: this.maskSensitiveData(error.message, this.currentLevel, {
            maskIds: true
          }),
          stack: this.maskSensitiveData(error.stack, this.currentLevel, {
            maskIds: true
          }),
          // Masquer les autres propriétés
          ...this.maskObject(error, this.currentLevel, { maskIds: true })
        };
      } else {
        // Pour les objets non-Error, utiliser le masquage normal
        maskedError = this.maskObject(error, this.currentLevel, {
          maskIds: true
        });
      }
    }

    const maskedContext = context
      ? this.maskObject(context, this.currentLevel, { maskIds: true })
      : null;

    logger.error(`[SECURE] ${maskedMessage}`, {
      error: maskedError,
      context: maskedContext,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Logger d'audit sécurisé
   */
  secureAudit (action, userId, details = null) {
    const maskedUserId = this.maskSensitiveData(userId, this.currentLevel, {
      maskIds: true
    });
    const maskedDetails = details
      ? this.maskObject(details, this.currentLevel, { maskIds: true })
      : null;

    logger.info(`[AUDIT] ${action}`, {
      userId: maskedUserId,
      details: maskedDetails,
      timestamp: new Date().toISOString(),
      ip: this.getClientIP() || '[IP_MASQUÉE]'
    });
  }

  /**
   * Logger de sécurité pour les tentatives d'attaque
   */
  secureSecurityAlert (alertType, details = null, userId = null) {
    const maskedDetails = details
      ? this.maskObject(details, this.currentLevel, { maskIds: true })
      : null;
    const maskedUserId = userId
      ? this.maskSensitiveData(userId, this.currentLevel, { maskIds: true })
      : null;

    logger.warn(`[SÉCURITÉ] ${alertType}`, {
      userId: maskedUserId,
      details: maskedDetails,
      timestamp: new Date().toISOString(),
      ip: this.getClientIP() || '[IP_MASQUÉE]'
    });
  }

  /**
   * Logger de performance sécurisé
   */
  securePerformance (operation, duration, details = null) {
    const maskedDetails = details
      ? this.maskObject(details, this.currentLevel, { maskIds: false })
      : null;

    logger.info(`[PERFORMANCE] ${operation}`, {
      duration: `${duration}ms`,
      details: maskedDetails,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Logger de debug sécurisé (pour le développement)
   */
  secureDebug (message, data = null) {
    if (
      this.securityContext.isDevelopment
      || this.securityContext.logLevel === 'debug'
    ) {
      const maskedMessage = this.maskSensitiveData(message, this.currentLevel, {
        maskIds: false
      });
      const maskedData = data
        ? this.maskObject(data, this.currentLevel, { maskIds: false })
        : null;

      logger.debug(`[DEBUG] ${maskedMessage}`, maskedData);
    }
  }

  /**
   * Obtenir l'IP du client (pour les logs d'audit)
   */
  getClientIP () {
    // Cette méthode devrait être adaptée selon votre contexte
    // (Express.js, etc.)
    return process.env.CLIENT_IP || null;
  }

  /**
   * Définir le niveau de sécurité
   */
  setSecurityLevel (level) {
    if (Object.values(this.securityLevels).includes(level)) {
      this.currentLevel = level;
      logger.info(`Niveau de sécurité défini: ${level}`);
    } else {
      logger.warn(`Niveau de sécurité invalide: ${level}`);
    }
  }

  /**
   * Ajouter un token connu (pour éviter de le masquer)
   */
  addKnownToken (token) {
    if (token && typeof token === 'string') {
      this.knownTokens.add(token);
    }
  }

  /**
   * Supprimer un token connu (pour forcer le masquage)
   */
  removeKnownToken (token) {
    if (token && typeof token === 'string') {
      this.knownTokens.delete(token);
    }
  }

  /**
   * Vérifier si une chaîne contient des données sensibles
   */
  containsSensitiveData (text) {
    return this.sensitivePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Obtenir les statistiques de masquage
   */
  getMaskingStats () {
    return {
      securityLevel: this.currentLevel,
      patternsCount: this.sensitivePatterns.length,
      replacementsCount: Object.keys(this.replacements).length,
      knownTokensCount: this.knownTokens.size,
      environment: this.securityContext
    };
  }

  /**
   * Obtenir le contexte de sécurité actuel
   */
  getSecurityContext () {
    return { ...this.securityContext };
  }
}

// Instance singleton
const secureLogger = new SecureLogger();

// Fonctions utilitaires
export function secureLog (level, message, data = null, context = {}) {
  return secureLogger.secureLog(level, message, data, context);
}

export function secureError (message, error = null, context = null) {
  return secureLogger.secureError(message, error, context);
}

export function secureAudit (action, userId, details = null) {
  return secureLogger.secureAudit(action, userId, details);
}

export function secureSecurityAlert (alertType, details = null, userId = null) {
  return secureLogger.secureSecurityAlert(alertType, details, userId);
}

export function securePerformance (operation, duration, details = null) {
  return secureLogger.securePerformance(operation, duration, details);
}

export function secureDebug (message, data = null) {
  return secureLogger.secureDebug(message, data);
}

export function maskSensitiveData (data, level = 'medium', context = {}) {
  return secureLogger.maskSensitiveData(data, level, context);
}

export function containsSensitiveData (text) {
  return secureLogger.containsSensitiveData(text);
}

export function addKnownToken (token) {
  return secureLogger.addKnownToken(token);
}

export function removeKnownToken (token) {
  return secureLogger.removeKnownToken(token);
}

export { secureLogger };

