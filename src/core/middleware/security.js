// ========================================
// core/middleware/security.js - Middlewares de sécurité pour Express
// ========================================

import rateLimiter from '#core/services/rateLimiter.js';
import validator from '#shared/validation/validation.js';
import { secureLog, secureError, secureSecurityAlert }
  from '#shared/logging/secureLogger.js';

/**
 * Middleware de validation des entrées
 */
export function validateInput (req, res, next) {
  try {
    // Valider les paramètres de requête
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          req.query[key] = validator.sanitizeString(value, {
            escapeHtml: true
          });
        }
      }
    }

    // Valider le body
    if (req.body) {
      if (typeof req.body === 'string') {
        req.body = validator.sanitizeString(req.body, { escapeHtml: true });
      } else if (typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
      }
    }

    // Valider les paramètres d'URL
    if (req.params) {
      for (const [key, value] of Object.entries(req.params)) {
        if (typeof value === 'string') {
          req.params[key] = validator.sanitizeString(value);
        }
      }
    }

    next();
  } catch (error) {
    secureError('Erreur de validation des entrées', error, {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    res.status(400).json({ error: 'Données d\'entrée invalides' });
  }
}

/**
 * Middleware de rate limiting pour l'API
 */
export function apiRateLimit (req, res, next) {
  const clientId = req.ip || req.connection.remoteAddress;
  const result = rateLimiter.canExecute(clientId, 'api');

  if (!result.allowed) {
    secureSecurityAlert('Rate limit API dépassé', {
      clientId,
      url: req.url,
      method: req.method,
      remainingTime: result.remainingTime
    });

    res.set('Retry-After', Math.ceil(result.remainingTime / 1000));
    return res.status(429).json({
      error: 'Trop de requêtes',
      retryAfter: Math.ceil(result.remainingTime / 1000)
    });
  }

  // Enregistrer la requête
  rateLimiter.recordExecution(clientId, 'api');

  // Ajouter les headers de rate limiting
  res.set('X-RateLimit-Limit', '20');
  res.set('X-RateLimit-Remaining', result.remaining);
  res.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  next();
}

/**
 * Middleware de protection contre les attaques XSS
 */
export function xssProtection (req, res, next) {
  // Headers de sécurité
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Vérifier les tentatives XSS dans les entrées
  const checkForXSS = (obj) => {
    if (typeof obj === 'string') {
      return validator.containsDangerousHtml(obj);
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some((value) => checkForXSS(value));
    }
    return false;
  };

  if (
    checkForXSS(req.body)
    || checkForXSS(req.query)
    || checkForXSS(req.params)
  ) {
    secureSecurityAlert('Tentative XSS détectée', {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(400).json({ error: 'Contenu malveillant détecté' });
  }

  next();
}

/**
 * Middleware de protection contre les injections SQL
 */
export function sqlInjectionProtection (req, res, next) {
  const sqlPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,
    // eslint-disable-next-line max-len
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(--|\/\*|\*\/|;)/g
  ];

  const checkForSQLInjection = (obj) => {
    if (typeof obj === 'string') {
      return sqlPatterns.some((pattern) => pattern.test(obj));
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some((value) => checkForSQLInjection(value));
    }
    return false;
  };

  if (
    checkForSQLInjection(req.body)
    || checkForSQLInjection(req.query)
    || checkForSQLInjection(req.params)
  ) {
    secureSecurityAlert('Tentative d\'injection SQL détectée', {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(400).json({ error: 'Requête malveillante détectée' });
  }

  next();
}

/**
 * Middleware de protection contre les attaques par déni de service
 */
export function dosProtection (req, res, next) {
  const clientIP = req.ip;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 50; // Limite par IP

  // Nettoyer les anciennes entrées
  if (!req.app.locals.dosTracker) {
    req.app.locals.dosTracker = new Map();
  }

  const tracker = req.app.locals.dosTracker;
  const windowStart = now - windowMs;

  // Nettoyer les anciennes entrées
  for (const [ip, requests] of tracker.entries()) {
    const recentRequests = requests.filter(
      (timestamp) => timestamp > windowStart
    );
    if (recentRequests.length === 0) {
      tracker.delete(ip);
    } else {
      tracker.set(ip, recentRequests);
    }
  }

  // Vérifier les requêtes pour cette IP
  const clientRequests = tracker.get(clientIP) || [];
  const recentClientRequests = clientRequests.filter(
    (timestamp) => timestamp > windowStart
  );

  if (recentClientRequests.length >= maxRequests) {
    secureSecurityAlert('Attaque DoS détectée', {
      ip: clientIP,
      requests: recentClientRequests.length,
      userAgent: req.get('User-Agent')
    });

    return res.status(429).json({
      error: 'Trop de requêtes',
      retryAfter: Math.ceil(windowMs / 1000),
      timestamp: new Date().toISOString()
    });
  }

  // Ajouter la requête actuelle
  recentClientRequests.push(now);
  tracker.set(clientIP, recentClientRequests);

  next();
}

/**
 * Middleware de validation des timeouts
 */
export function timeoutProtection (timeoutMs = 30000) {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        secureSecurityAlert('Timeout de requête', {
          url: req.url,
          method: req.method,
          ip: req.ip,
          timeout: timeoutMs
        });

        res.status(408).json({
          error: 'Timeout de la requête',
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    // Nettoyer le timeout si la requête se termine normalement
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}

/**
 * Middleware de validation des headers de sécurité
 */
export function validateHeaders (req, res, next) {
  const suspiciousHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-forwarded-proto',
    'x-forwarded-host'
  ];

  const hasSuspiciousHeaders = suspiciousHeaders.some(
    (header) =>
      req.headers[header] && !req.headers[header].match(/^[\w\-.,:]+$/)
  );

  if (hasSuspiciousHeaders) {
    secureSecurityAlert('Headers suspects détectés', {
      url: req.url,
      method: req.method,
      ip: req.ip,
      headers: Object.keys(req.headers)
    });

    return res.status(400).json({
      error: 'Headers invalides',
      timestamp: new Date().toISOString()
    });
  }

  next();
}

/**
 * Middleware de logging sécurisé des requêtes
 */
export function secureRequestLogging (req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: req.get('content-length') || 0
    };

    // Log selon le statut de la réponse
    if (res.statusCode >= 400) {
      secureError('Requête échouée', null, logData);
    } else {
      secureLog('info', 'Requête traitée', logData);
    }
  });

  next();
}

/**
 * Middleware de validation des permissions
 */
export function validatePermissions (requiredPermissions = []) {
  return (req, res, next) => {
    try {
      // Vérifier si l'utilisateur est authentifié
      if (!req.user) {
        return res.status(401).json({ error: 'Authentification requise' });
      }

      // Vérifier les permissions
      if (requiredPermissions.length > 0) {
        const userPermissions = req.user.permissions || [];
        const hasPermission = requiredPermissions.every((permission) =>
          userPermissions.includes(permission));

        if (!hasPermission) {
          secureSecurityAlert(
            'Tentative d\'accès non autorisé',
            req.user.id,
            {
              url: req.url,
              method: req.method,
              requiredPermissions,
              userPermissions
            }
          );

          return res.status(403).json({ error: 'Permissions insuffisantes' });
        }
      }

      next();
    } catch (error) {
      secureError('Erreur de validation des permissions', error, {
        url: req.url,
        method: req.method,
        userId: req.user?.id
      });
      res.status(500).json({ error: 'Erreur de validation des permissions' });
    }
  };
}

/**
 * Middleware de validation des tokens Discord
 */
export function validateDiscordToken (req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token Discord requis' });
    }

    // Valider le format du token
    if (!token.startsWith('MTA') && !token.startsWith('OTk')) {
      secureSecurityAlert('Token Discord invalide', {
        url: req.url,
        method: req.method,
        ip: req.ip
      });

      return res.status(401).json({ error: 'Token Discord invalide' });
    }

    // Ajouter le token à la requête
    req.discordToken = token;
    next();
  } catch (error) {
    secureError('Erreur de validation du token Discord', error, {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur de validation du token' });
  }
}

/**
 * Middleware de validation des fichiers uploadés
 */
export function validateFileUpload (req, res, next) {
  if (!req.files || Object.keys(req.files).length === 0) {
    return next();
  }

  try {
    for (const [, file] of Object.entries(req.files)) {
      // Valider le nom du fichier
      const sanitizedFilename = validator.validateFilename(file.name);

      // Vérifier la taille (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'Fichier trop volumineux' });
      }

      // Vérifier le type MIME
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'text/plain',
        'application/json'
      ];

      if (!allowedTypes.includes(file.mimetype)) {
        secureSecurityAlert('Type de fichier non autorisé', {
          filename: sanitizedFilename,
          mimetype: file.mimetype,
          size: file.size,
          ip: req.ip
        });

        return res.status(400).json({ error: 'Type de fichier non autorisé' });
      }

      // Mettre à jour le nom du fichier
      file.name = sanitizedFilename;
    }

    next();
  } catch (error) {
    secureError('Erreur de validation de fichier', error, {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    res.status(400).json({ error: 'Fichier invalide' });
  }
}

/**
 * Fonction utilitaire pour sanitizer un objet
 */
function sanitizeObject (obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = validator.sanitizeString(value, { escapeHtml: true });
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Export des middlewares combinés
export const securityMiddleware = [
  validateInput,
  xssProtection,
  sqlInjectionProtection,
  validateHeaders,
  secureRequestLogging
];

export const apiSecurityMiddleware = [
  ...securityMiddleware,
  apiRateLimit,
  validateDiscordToken
];

export const adminSecurityMiddleware = [
  ...securityMiddleware,
  dosProtection,
  validatePermissions(['ManageGuild', 'ManageRoles'])
];
