// ========================================
// core/utils/rateLimiter.js - Système de rate limiting pour Discord
// ========================================

import logger from "../../shared/logging/logger.js";

/**
 * Classe de rate limiting avec différents niveaux de limitation
 */
class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.windows = new Map();
    this.blockedUsers = new Map();

    // Configuration des limites par type de commande
    this.configs = {
      // Commandes générales (ping, help)
      general: {
        maxRequests: 10,
        windowMs: 60000, // 1 minute
        blockDuration: 300000, // 5 minutes
      },
      // Commandes de suggestion
      suggestion: {
        maxRequests: 3,
        windowMs: 300000, // 5 minutes
        blockDuration: 900000, // 15 minutes
      },
      // Commandes DJ (admin)
      dj: {
        maxRequests: 5,
        windowMs: 60000, // 1 minute
        blockDuration: 600000, // 10 minutes
      },
      // Commandes critiques
      critical: {
        maxRequests: 2,
        windowMs: 60000, // 1 minute
        blockDuration: 1800000, // 30 minutes
      },
      // API requests
      api: {
        maxRequests: 20,
        windowMs: 60000, // 1 minute
        blockDuration: 300000, // 5 minutes
      },
    };
  }

  /**
   * Vérifier si un utilisateur peut exécuter une commande
   */
  canExecute(userId, commandType = "general") {
    const config = this.configs[commandType] || this.configs.general;
    const key = `${userId}:${commandType}`;

    // Vérifier si l'utilisateur est bloqué
    if (this.isBlocked(userId, commandType)) {
      return {
        allowed: false,
        reason: "USER_BLOCKED",
        remainingTime: this.getBlockRemainingTime(userId, commandType),
      };
    }

    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Nettoyer les anciennes entrées
    this.cleanOldEntries(key, windowStart);

    // Récupérer les requêtes actuelles
    const requests = this.windows.get(key) || [];
    const recentRequests = requests.filter(
      (timestamp) => timestamp > windowStart
    );

    // Vérifier la limite
    if (recentRequests.length >= config.maxRequests) {
      // Bloquer l'utilisateur temporairement
      this.blockUser(userId, commandType, config.blockDuration);

      logger.warn(`Rate limit dépassé pour ${userId} sur ${commandType}`, {
        userId,
        commandType,
        requests: recentRequests.length,
        limit: config.maxRequests,
        blockDuration: config.blockDuration,
      });

      return {
        allowed: false,
        reason: "RATE_LIMIT_EXCEEDED",
        remainingTime: config.blockDuration,
        retryAfter: this.getNextWindowTime(key, config.windowMs),
      };
    }

    // Ajouter la requête actuelle
    recentRequests.push(now);
    this.windows.set(key, recentRequests);

    return {
      allowed: true,
      remaining: config.maxRequests - recentRequests.length,
      resetTime: windowStart + config.windowMs,
    };
  }

  /**
   * Enregistrer l'exécution d'une commande
   */
  recordExecution(userId, commandType = "general") {
    const key = `${userId}:${commandType}`;
    const now = Date.now();

    if (!this.windows.has(key)) {
      this.windows.set(key, []);
    }

    this.windows.get(key).push(now);

    // Log pour audit (debug pour réduire le bruit)
    logger.debug(`Commande exécutée: ${commandType} par ${userId}`, {
      userId,
      commandType,
      timestamp: now,
    });
  }

  /**
   * Vérifier si un utilisateur est bloqué
   */
  isBlocked(userId, commandType = "general") {
    const key = `${userId}:${commandType}`;
    const blockInfo = this.blockedUsers.get(key);

    if (!blockInfo) return false;

    // Vérifier si le blocage a expiré
    if (Date.now() > blockInfo.expiresAt) {
      this.blockedUsers.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Bloquer un utilisateur temporairement
   */
  blockUser(userId, commandType, duration) {
    const key = `${userId}:${commandType}`;
    this.blockedUsers.set(key, {
      userId,
      commandType,
      blockedAt: Date.now(),
      expiresAt: Date.now() + duration,
    });

    logger.warn(`Utilisateur bloqué: ${userId} sur ${commandType}`, {
      userId,
      commandType,
      duration,
      expiresAt: new Date(Date.now() + duration).toISOString(),
    });
  }

  /**
   * Débloquer un utilisateur manuellement
   */
  unblockUser(userId, commandType = "general") {
    const key = `${userId}:${commandType}`;
    const wasBlocked = this.blockedUsers.has(key);

    this.blockedUsers.delete(key);
    this.windows.delete(key);

    if (wasBlocked) {
      logger.info(
        `Utilisateur débloqué manuellement: ${userId} sur ${commandType}`,
        {
          userId,
          commandType,
        }
      );
    }

    return wasBlocked;
  }

  /**
   * Obtenir le temps restant de blocage
   */
  getBlockRemainingTime(userId, commandType = "general") {
    const key = `${userId}:${commandType}`;
    const blockInfo = this.blockedUsers.get(key);

    if (!blockInfo) return 0;

    const remaining = blockInfo.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Obtenir le temps jusqu'à la prochaine fenêtre
   */
  getNextWindowTime(key, windowMs) {
    const requests = this.windows.get(key) || [];
    if (requests.length === 0) return 0;

    const oldestRequest = Math.min(...requests);
    return oldestRequest + windowMs - Date.now();
  }

  /**
   * Nettoyer les anciennes entrées
   */
  cleanOldEntries(key, windowStart) {
    const requests = this.windows.get(key);
    if (!requests) return;

    const filtered = requests.filter((timestamp) => timestamp > windowStart);
    this.windows.set(key, filtered);
  }

  /**
   * Nettoyer périodiquement les données expirées
   */
  cleanup() {
    const now = Date.now();

    // Nettoyer les fenêtres
    for (const [key, requests] of this.windows) {
      const [, commandType] = key.split(":");
      const config = this.configs[commandType] || this.configs.general;
      const windowStart = now - config.windowMs;

      const filtered = requests.filter((timestamp) => timestamp > windowStart);
      if (filtered.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, filtered);
      }
    }

    // Nettoyer les blocages expirés
    for (const [key, blockInfo] of this.blockedUsers) {
      if (now > blockInfo.expiresAt) {
        this.blockedUsers.delete(key);
      }
    }
  }

  /**
   * Obtenir les statistiques de rate limiting
   */
  getStats() {
    const stats = {
      totalWindows: this.windows.size,
      totalBlocked: this.blockedUsers.size,
      blockedUsers: [],
      commandStats: {},
    };

    // Statistiques par commande
    for (const [key, requests] of this.windows) {
      const [, commandType] = key.split(":");
      if (!stats.commandStats[commandType]) {
        stats.commandStats[commandType] = {
          activeWindows: 0,
          totalRequests: 0,
        };
      }
      stats.commandStats[commandType].activeWindows++;
      stats.commandStats[commandType].totalRequests += requests.length;
    }

    // Utilisateurs bloqués
    for (const [key, blockInfo] of this.blockedUsers) {
      const [userId, commandType] = key.split(":");
      stats.blockedUsers.push({
        userId,
        commandType,
        blockedAt: new Date(blockInfo.blockedAt).toISOString(),
        expiresAt: new Date(blockInfo.expiresAt).toISOString(),
        remainingTime: this.getBlockRemainingTime(userId, commandType),
      });
    }

    return stats;
  }

  /**
   * Réinitialiser toutes les limitations
   */
  reset() {
    this.windows.clear();
    this.blockedUsers.clear();
    logger.info("Rate limiter réinitialisé");
  }
}

// Instance singleton
const rateLimiter = new RateLimiter();

// Nettoyage automatique toutes les 5 minutes
setInterval(() => {
  rateLimiter.cleanup();
}, 5 * 60 * 1000);

// Fonctions utilitaires
export function checkRateLimit(userId, commandType = "general") {
  return rateLimiter.canExecute(userId, commandType);
}

export function recordCommand(userId, commandType = "general") {
  rateLimiter.recordExecution(userId, commandType);
}

export function isUserBlocked(userId, commandType = "general") {
  return rateLimiter.isBlocked(userId, commandType);
}

export function unblockUser(userId, commandType = "general") {
  return rateLimiter.unblockUser(userId, commandType);
}

export function getRateLimitStats() {
  return rateLimiter.getStats();
}

export default rateLimiter;

