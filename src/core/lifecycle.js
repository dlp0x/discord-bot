// ========================================
// core/lifecycle.js
// ========================================

import logger from '#shared/logging/logger.js';
import alertManager from '#core/services/AlertManager.js';
import errorHandler from './monitor.js';

export function registerProcessHandlers ({ gracefulShutdown }) {
  const shutdownWithFallback = (signal) => {
    gracefulShutdown(signal);
    forceExit(); // fallback après un délai
  };

  process.on('SIGINT', () => {
    shutdownWithFallback('SIGINT');
  });

  process.on('SIGTERM', () => {
    logger.warn('Signal SIGTERM reçu.');
    shutdownWithFallback('SIGTERM');
  });

  process.once('SIGUSR2', async () => {
    logger.warn('Signal SIGUSR2 reçu.');
  
    await gracefulShutdown('SIGUSR2');
  
    process.kill(process.pid, 'SIGUSR2');
  });

  process.on('unhandledRejection', (reason) => {
    if (reason?.message?.includes('Shard 0 not found')) {
      logger.warn('Shard non trouvé à la fermeture. Pas de panique.');
      return;
    }

    logger.error('Promesse rejetée non gérée:', reason);
    alertManager.createAlert(
      'unhandled_rejection',
      'error',
      `Promesse rejetée non gérée: ${reason.message}`,
      { context: 'process' }
    );
    errorHandler.handleCriticalError(reason, 'UNHANDLED_REJECTION');
  });

  process.on('uncaughtException', async (error) => {
    logger.error('Exception non capturée:', error);
    alertManager.createAlert(
      'uncaught_exception',
      'critical',
      `Exception non capturée: ${error.message}`,
      { context: 'process' }
    );
    errorHandler.handleCriticalError(error, 'UNCAUGHT_EXCEPTION');
    await gracefulShutdown('UNCAUGHT_EXCEPTION');
    forceExit();
  });
}

function forceExit (timeout = 5000) {
  setTimeout(() => {
    logger.error(`Fermeture forcée après ${timeout}ms`);
    process.exit(1);
  }, timeout);
}