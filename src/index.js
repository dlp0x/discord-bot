// ========================================
// index.js - Point d'entree principal
// ========================================

import 'dotenv/config';
import fs from 'fs';
import WebServer from '#api/index.js';
import { startBot, stopBot } from './bot/startup.js';
import config from './bot/config.js';
import logger from '#shared/logging/logger.js';
import logMemory from './bot/tasks/logMemory.js';
import { registerProcessHandlers } from '#core/lifecycle.js';
import appState from '#core/services/AppState.js';
import { db as database } from '#shared/database/database.js';
import { retryDiscord, retry } from '#core/services/retry.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

let botClient = null;
let apiServer = null;
let isShuttingDown = false;

appState.initialize();
appState.setConfigLoaded(config);

async function gracefulShutdown (signal = 'UNKNOWN') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`Fermeture demandee (signal: ${signal})`);

  try {
    if (apiServer) {
      await apiServer.stop();
      appState.setApiRunning(false);
    }

    if (botClient) {
      await stopBot();
      appState.setBotConnected(false);
      appState.setBotReady(false);
    }

    await database.connect();
    appState.setDatabaseConnected(false);
    appState.setDatabaseHealthy(false);

    process.exit(0);
  } catch (error) {
    logger.error('Erreur durant la fermeture:', error);
    process.exit(1);
  }
}

async function startApplication () {
  try {
    console.log('');
    logger.info(`Version: ${pkg.version}`);
    logger.info(`Node.js: ${process.version}`);
    logger.info(`Environnement: ${config.NODE_ENV}`);

    botClient = await retryDiscord(
      async () => {
        const client = await startBot();
        appState.setBotConnected(true);
        appState.setBotReady(true);
        return client;
      },
      {
        onRetry: (error, attempt) =>
          logger.warn(`Retry Discord ${attempt}: ${error.message}`)
      }
    );

    apiServer = new WebServer(botClient, logger);
    logger.banner('Initialisation du serveur API...');

    await retry(
      async () => {
        await apiServer.start(config.API_PORT);
        appState.setApiRunning(true, config.API_PORT);
      },
      {
        onRetry: (error, attempt) =>
          logger.warn(`Retry API ${attempt}: ${error.message}`)
      }
    );

    logger.success(`API en ligne sur le port ${config.API_PORT}`);
    registerProcessHandlers({ gracefulShutdown });

    logger.api(
      'Routes API disponibles : /v1/health, /v1/playlist-update'
    );
    logMemory.execute();
    logger.banner('Bot pret. Logging en cours...');
  } catch (error) {
    logger.error('Erreur critique au demarrage:', error);

    try {
      if (botClient) await stopBot();
      if (apiServer) await apiServer.stop();
      await database.disconnect();
    } catch (cleanupError) {
      logger.error('Erreur lors du cleanup:', cleanupError);
    }

    process.exit(1);
  }
}

startApplication();
