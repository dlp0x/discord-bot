// ========================================
// core/utils/validation.js - Système de validation et sanitization
// ========================================

import logger from '../../shared/logging/logger.js';

/**
 * Classe de validation et sanitization des entrées utilisateur
 */
class InputValidator {
  constructor () {
    this.maxLengths = {
      suggestion: 1000,
      username: 32,
      command: 100,
      message: 2000,
      url: 2048,
      filename: 255
    };

    this.patterns = {
      // Discord ID (17-19 chiffres)
      discordId: /^\d{17,19}$/,
      // URL sécurisée
      url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,
      // Email basique
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      // Nom de fichier sécurisé
      filename: /^[a-zA-Z0-9._-]+$/,
      // Code de commande sécurisé
      commandCode: /^[a-zA-Z0-9_-]+$/
    };

    this.forbiddenPatterns = [
      // Scripts et injections
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /document\./gi,
      /window\./gi,
      // Commandes système
      /[;&|`$]/g,
      // URLs suspectes
      /data:text\/html/gi,
      /vbscript:/gi,
      // Caractères de contrôle
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
    ];
  }

  /**
   * Sanitize une chaîne de caractères
   */
  sanitizeString (input, options = {}) {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    let sanitized = input.trim();

    sanitized = this.stripScriptBlocks(sanitized);

    // Supprimer les caractères de contrôle
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Supprimer les patterns interdits
    this.forbiddenPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Échapper les caractères spéciaux si demandé
    if (options.escapeHtml) {
      sanitized = this.escapeHtml(sanitized);
    }

    // Limiter la longueur
    const maxLength = options.maxLength || this.maxLengths.suggestion;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Valider une suggestion
   */
  validateSuggestion (suggestion) {
    const sanitized = this.sanitizeString(suggestion, {
      maxLength: this.maxLengths.suggestion,
      escapeHtml: true
    });

    if (sanitized.length < 3) {
      throw new Error('La suggestion doit contenir au moins 3 caractères');
    }

    if (sanitized.length > this.maxLengths.suggestion) {
      throw new Error(
        `La suggestion ne peut pas dépasser ${this.maxLengths.suggestion} caractères`
      );
    }

    // Vérifier les mots interdits
    if (this.containsForbiddenContent(sanitized)) {
      throw new Error('La suggestion contient du contenu interdit');
    }

    return sanitized;
  }

  /**
   * Valider un Discord ID
   */
  validateDiscordId (id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Discord ID invalide');
    }

    if (!this.patterns.discordId.test(id)) {
      throw new Error('Format de Discord ID invalide');
    }

    return id;
  }

  /**
   * Valider un nom d'utilisateur
   */
  validateUsername (username) {
    const sanitized = this.sanitizeString(username, {
      maxLength: this.maxLengths.username
    });

    if (sanitized.length < 2) {
      throw new Error(
        'Le nom d\'utilisateur doit contenir au moins 2 caractères'
      );
    }

    if (sanitized.length > this.maxLengths.username) {
      throw new Error(
        `Le nom d'utilisateur ne peut pas dépasser ${this.maxLengths.username} caractères`
      );
    }

    return sanitized;
  }

  /**
   * Valider une URL
   */
  validateUrl (url) {
    const sanitized = this.sanitizeString(url, {
      maxLength: this.maxLengths.url
    });

    if (!this.patterns.url.test(sanitized)) {
      throw new Error('URL invalide');
    }

    // Vérifier les protocoles autorisés
    if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
      throw new Error('Seuls les protocoles HTTP et HTTPS sont autorisés');
    }

    return sanitized;
  }

  /**
   * Valider un nom de fichier
   */
  validateFilename (filename) {
    const sanitized = this.sanitizeString(filename, {
      maxLength: this.maxLengths.filename
    });

    if (!this.patterns.filename.test(sanitized)) {
      throw new Error('Nom de fichier invalide');
    }

    // Vérifier les extensions interdites
    const forbiddenExtensions = [
      '.exe',
      '.bat',
      '.cmd',
      '.com',
      '.pif',
      '.scr',
      '.vbs',
      '.js'
    ];
    const extension = sanitized
      .toLowerCase()
      .substring(sanitized.lastIndexOf('.'));

    if (forbiddenExtensions.includes(extension)) {
      throw new Error('Type de fichier non autorisé');
    }

    return sanitized;
  }

  /**
   * Valider une commande
   */
  validateCommand (command) {
    const sanitized = this.sanitizeString(command, {
      maxLength: this.maxLengths.command
    });

    if (!this.patterns.commandCode.test(sanitized)) {
      throw new Error('Commande invalide');
    }

    return sanitized;
  }

  /**
   * Vérifier le contenu interdit
   */
  containsForbiddenContent (text) {
    const forbiddenWords = [
      'spam',
      'scam',
      'phishing',
      'malware',
      'virus',
      'hack',
      'crack',
      'cheat',
      'exploit',
      'ddos'
    ];

    const lowerText = text.toLowerCase();
    return forbiddenWords.some((word) => lowerText.includes(word));
  }

  /**
   * Détecter des fragments HTML dangereux sans s'appuyer sur une regexp de filtrage HTML
   */
  containsDangerousHtml (text) {
    if (typeof text !== 'string') {
      return false;
    }

    const normalized = text.toLowerCase();
    return normalized.includes('<script')
      || normalized.includes('</script')
      || normalized.includes(`java${'script:'}`)
      || normalized.includes(`vb${'script:'}`)
      || normalized.includes('data:text/html')
      || (/on\w+\s*=/).test(normalized);
  }

  /**
   * Supprimer récursivement les blocs <script>...</script>
   */
  stripScriptBlocks (text) {
    if (typeof text !== 'string' || text.length === 0) {
      return text;
    }

    let sanitized = text;
    let lowerText = sanitized.toLowerCase();
    let scriptStart = lowerText.indexOf('<script');

    while (scriptStart !== -1) {
      const scriptEnd = lowerText.indexOf('</script>', scriptStart);
      const endIndex = scriptEnd === -1 ? sanitized.length : scriptEnd + '</script>'.length;

      sanitized = sanitized.slice(0, scriptStart) + sanitized.slice(endIndex);
      lowerText = sanitized.toLowerCase();
      scriptStart = lowerText.indexOf('<script');
    }

    return sanitized.replaceAll('</script>', '');
  }

  /**
   * Échapper les caractères HTML
   */
  escapeHtml (text) {
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#x27;',
      '/': '&#x2F;'
    };

    return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char]);
  }

  /**
   * Valider un objet de configuration
   */
  validateConfig (config) {
    const required = ['token', 'clientId', 'guildId'];
    const missing = required.filter((key) => !config[key]);

    if (missing.length > 0) {
      throw new Error(`Configuration manquante: ${missing.join(', ')}`);
    }

    // Valider le token Discord
    if (!config.token.startsWith('MTA') && !config.token.startsWith('OTk')) {
      throw new Error('Token Discord invalide');
    }

    return config;
  }

  /**
   * Valider les permissions
   */
  validatePermissions (permissions) {
    const validPermissions = [
      'SendMessages',
      'ReadMessageHistory',
      'UseSlashCommands',
      'ManageGuild',
      'ManageRoles',
      'KickMembers',
      'BanMembers'
    ];

    if (!Array.isArray(permissions)) {
      throw new Error('Permissions doit être un tableau');
    }

    const invalid = permissions.filter(
      (perm) => !validPermissions.includes(perm)
    );
    if (invalid.length > 0) {
      throw new Error(`Permissions invalides: ${invalid.join(', ')}`);
    }

    return permissions;
  }

  /**
   * Log de validation pour audit
   */
  logValidation (type, input, result, userId = null) {
    logger.info(`Validation ${type}`, {
      type,
      inputLength: input?.length || 0,
      resultLength: result?.length || 0,
      userId,
      timestamp: new Date().toISOString()
    });
  }
}

// Instance singleton
const validator = new InputValidator();

// Fonctions utilitaires
export function validateSuggestion (suggestion, userId = null) {
  try {
    const result = validator.validateSuggestion(suggestion);
    validator.logValidation('suggestion', suggestion, result, userId);
    return result;
  } catch (error) {
    logger.warn(`Validation suggestion échouée: ${error.message}`, { userId });
    throw error;
  }
}

export function validateDiscordId (id, userId = null) {
  try {
    const result = validator.validateDiscordId(id);
    validator.logValidation('discordId', id, result, userId);
    return result;
  } catch (error) {
    logger.warn(`Validation Discord ID échouée: ${error.message}`, { userId });
    throw error;
  }
}

export function validateUsername (username, userId = null) {
  try {
    const result = validator.validateUsername(username);
    validator.logValidation('username', username, result, userId);
    return result;
  } catch (error) {
    logger.warn(`Validation username échouée: ${error.message}`, { userId });
    throw error;
  }
}

export function validateUrl (url, userId = null) {
  try {
    const result = validator.validateUrl(url);
    validator.logValidation('url', url, result, userId);
    return result;
  } catch (error) {
    logger.warn(`Validation URL échouée: ${error.message}`, { userId });
    throw error;
  }
}

export function sanitizeString (input, options = {}) {
  return validator.sanitizeString(input, options);
}

export default validator;
