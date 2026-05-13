// ========================================
// bot/services/CacheManager.js
// Cache en memoire simple, TTL et stats
// ========================================

import logger from '../logger.js';

class CacheManager {
  constructor ({ defaultTtlMs = 60_000 } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  set (key, value, ttlMs = this.defaultTtlMs) {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
    this.stats.sets += 1;
    return value;
  }

  get (key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return null;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.stats.misses += 1;
      return null;
    }

    this.stats.hits += 1;
    return entry.value;
  }

  has (key) {
    return this.get(key) !== null;
  }

  delete (key) {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.stats.deletes += 1;
    }
    return deleted;
  }

  clear () {
    const sizeBefore = this.store.size;
    this.store.clear();
    logger.info(`[CACHE] cleared (${sizeBefore} entries)`);
    return sizeBefore;
  }

  size () {
    return this.store.size;
  }

  getStats () {
    return {
      ...this.stats,
      size: this.store.size
    };
  }
}

const cacheManager = new CacheManager();
export { CacheManager };
export default cacheManager;

