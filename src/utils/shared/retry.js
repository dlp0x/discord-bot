// ========================================
// core/utils/retry.js - Utilitaire de retry générique
// ========================================

import logger from '../../shared/logging/logger.js';

export class RetryManager {
  constructor (options = {}) {
    this.defaultOptions = {
      maxAttempts: 3,
      baseDelay: 1000, // 1 seconde
      maxDelay: 30000, // 30 secondes
      backoffMultiplier: 2,
      jitter: true,
      jitterFactor: 0.1,
      retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'],
      onRetry: null,
      onSuccess: null,
      onFailure: null
    };

    this.options = { ...this.defaultOptions, ...options };
  }

  async execute (operation, customOptions = {}) {
    const options = { ...this.options, ...customOptions };
    let lastError;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        const result = await operation();

        if (options.onSuccess) {
          options.onSuccess(result, attempt);
        }

        if (attempt > 1) {
          logger.info(`Opération réussie après ${attempt} tentatives`);
        }

        return result;
      } catch (error) {
        lastError = error;
        // Toujours exécuter la dernière tentative, même si non retryable
        if (attempt === options.maxAttempts) break;
        if (!this.shouldRetry(error, attempt, options)) break;
        const delay = this.calculateDelay(attempt, options);
        if (options.onRetry) {
          options.onRetry(error, attempt, delay);
        }
        logger.warn(
          `Tentative ${attempt} échouée, nouvelle tentative dans ${delay}ms: ${error.message}`
        );
        await this.sleep(delay);
      }
    }

    if (options.onFailure) {
      options.onFailure(lastError, options.maxAttempts);
    }

    logger.error(
      `Opération échouée après ${options.maxAttempts} tentatives: ${lastError.message}`
    );
    throw lastError;
  }

  shouldRetry (error, attempt, options) {
    // Vérifier si l'erreur est retryable
    const isRetryableError = options.retryableErrors.some(
      (retryableError) =>
        error.code === retryableError
        || error.message.includes(retryableError)
        || error.name === retryableError
    );

    // Vérifier si on a encore des tentatives
    const hasAttemptsLeft = attempt < options.maxAttempts;

    return isRetryableError && hasAttemptsLeft;
  }

  calculateDelay (attempt, options) {
    // Backoff exponentiel
    let delay
      = options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1);

    // Limiter le délai maximum
    delay = Math.min(delay, options.maxDelay);

    // Ajouter du jitter pour éviter les thundering herds
    if (options.jitter) {
      const jitterRange = delay * options.jitterFactor;
      delay += (Math.random() - 0.5) * jitterRange;
    }

    return Math.round(delay);
  }

  sleep (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Instances préconfigurées
const retryManager = new RetryManager();

// Configuration pour Discord API
const discordRetryManager = new RetryManager({
  maxAttempts: 5,
  baseDelay: 2000,
  maxDelay: 60000,
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'RATE_LIMIT'
  ],
  onRetry: (error, attempt, delay) => {
    logger.warn(`Discord API retry ${attempt}: ${error.message} (${delay}ms)`);
  }
});

// Configuration pour base de données
const databaseRetryManager = new RetryManager({
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 5000,
  retryableErrors: ['SQLITE_BUSY', 'SQLITE_LOCKED', 'ECONNREFUSED'],
  onRetry: (error, attempt, delay) => {
    logger.warn(`Database retry ${attempt}: ${error.message} (${delay}ms)`);
  }
});

// Configuration pour API externe
const apiRetryManager = new RetryManager({
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    '429'
  ],
  onRetry: (error, attempt, delay) => {
    logger.warn(`API retry ${attempt}: ${error.message} (${delay}ms)`);
  }
});

// Fonctions utilitaires
export async function retry (operation, options = {}) {
  return retryManager.execute(operation, options);
}

export async function retryDiscord (operation, options = {}) {
  return discordRetryManager.execute(operation, options);
}

export async function retryDatabase (operation, options = {}) {
  return databaseRetryManager.execute(operation, options);
}

export async function retryApi (operation, options = {}) {
  return apiRetryManager.execute(operation, options);
}

// Export des instances pour configuration avancée
export {
  retryManager,
  discordRetryManager,
  databaseRetryManager,
  apiRetryManager
};
export default retryManager;
