// ========================================
// utils/bot/cacheManager.js - Système de cache en mémoire avec TTL
// ========================================

import logger from '#shared/logging/logger.js';

class Cache {
  constructor() {
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0,
    };

    // Nettoyage automatique toutes les 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Définit une valeur dans le cache
   */
  set(key, value, ttl = 300000) {
    // 5 minutes par défaut
    const expiresAt = Date.now() + ttl;

    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
    });

    this.stats.sets++;
    this.stats.size = this.store.size;

    logger.debug(`Cache SET: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Récupère une valeur du cache
   */
  get(key) {
    const item = this.store.get(key);

    if (!item) {
      this.stats.misses++;
      logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    // Vérifier l'expiration
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.size = this.store.size;
      logger.debug(`Cache EXPIRED: ${key}`);
      return null;
    }

    this.stats.hits++;
    logger.debug(`Cache HIT: ${key}`);
    return item.value;
  }

  /**
   * Vérifie si une clé existe dans le cache
   */
  has(key) {
    const item = this.store.get(key);
    if (!item) return false;

    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.stats.size = this.store.size;
      return false;
    }

    return true;
  }

  /**
   * Supprime une clé du cache
   */
  delete(key) {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.store.size;
      logger.debug(`Cache DELETE: ${key}`);
    }
    return deleted;
  }

  /**
   * Vide tout le cache
   */
  clear() {
    const { size } = this.store;
    this.store.clear();
    this.stats.size = 0;
    logger.info(`Cache CLEARED: ${size} items removed`);
  }

  /**
   * Nettoie les éléments expirés
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    this.stats.size = this.store.size;

    if (cleaned > 0) {
      logger.debug(`Cache CLEANUP: ${cleaned} expired items removed`);
    }
  }

  /**
   * Récupère les statistiques du cache
   */
  getStats() {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
    };
  }

  /**
   * Estime l'utilisation mémoire du cache
   */
  getMemoryUsage() {
    let totalSize = 0;

    for (const [key, item] of this.store.entries()) {
      // Estimation grossière de la taille
      totalSize += JSON.stringify(key).length;
      totalSize += JSON.stringify(item.value).length;
      totalSize += 50; // Overhead pour les métadonnées
    }

    return {
      bytes: totalSize,
      kb: (totalSize / 1024).toFixed(2),
      mb: (totalSize / (1024 * 1024)).toFixed(2),
    };
  }

  /**
   * Méthodes utilitaires pour des cas d'usage spécifiques
   */

  // Cache avec fallback (get ou set si pas trouvé)
  async getOrSet(key, fallbackFn, ttl = 300000) {
    let value = this.get(key);

    if (value === null) {
      try {
        value = await fallbackFn();
        this.set(key, value, ttl);
      } catch (error) {
        logger.error(`Cache fallback error for ${key}: ${error.message}`);
        throw error;
      }
    }

    return value;
  }

  // Cache pour les requêtes API avec retry
  async getOrSetWithRetry(key, apiFn, ttl = 300000, maxRetries = 3) {
    let value = this.get(key);

    if (value === null) {
      let lastError;

      for (let i = 0; i < maxRetries; i++) {
        try {
          value = await apiFn();
          this.set(key, value, ttl);
          break;
        } catch (error) {
          lastError = error;
          logger.warn(
            `Cache API retry ${i + 1}/${maxRetries} for ${key}: ${
              error.message
            }`
          );

          if (i < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Backoff
          }
        }
      }

      if (!value) {
        throw lastError;
      }
    }

    return value;
  }

  // Cache pour les données Discord
  setDiscordData(key, value, ttl = 60000) {
    // 1 minute pour Discord
    this.set(`discord:${key}`, value, ttl);
  }

  getDiscordData(key) {
    return this.get(`discord:${key}`);
  }

  // Cache pour les playlists
  setPlaylist(key, value, ttl = 300000) {
    // 5 minutes pour les playlists
    this.set(`playlist:${key}`, value, ttl);
  }

  getPlaylist(key) {
    return this.get(`playlist:${key}`);
  }

  // Cache pour les suggestions
  setSuggestion(key, value, ttl = 1800000) {
    // 30 minutes pour les suggestions
    this.set(`suggestion:${key}`, value, ttl);
  }

  getSuggestion(key) {
    return this.get(`suggestion:${key}`);
  }

  /**
   * Arrêt propre du cache
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    logger.info("Cache destroyed");
  }
}

// Instance singleton
export const cache = new Cache();

// Gestion de l'arrêt propre
process.on("SIGINT", () => cache.destroy());
process.on("SIGTERM", () => cache.destroy());

export default cache;

