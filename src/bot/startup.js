// ========================================
// bot/startup.js (ESM)
// ========================================

import { createClient } from './client.js';
import config from './config.js';
import { loadCommands } from '#bot/bootstrap/loadCommands.js';
import { loadEvents } from '#bot/bootstrap/loadEvents.js';
import logger from '#shared/logging/logger.js';
import updateStatus from './tasks/updateStatus.js';
import errorHandler from '#core/monitor.js';

let client = null;
let updateStatusInterval = null;

export async function startBot () {
  try {
    client = createClient();

    await loadCommands(client);
    await loadEvents(client);
    await connectBot();
    startUpdateStatus();

    return client;
  } catch (error) {
    errorHandler.handleCriticalError(error, 'BOT_STARTUP');
    logger.error(`Erreur critique lors du demarrage : ${error.message}`);
    throw error;
  }
}

async function connectBot () {
  try {
    await client.login(config.DISCORD_TOKEN);
  } catch (error) {
    errorHandler.handleCriticalError(error, 'BOT_LOGIN');
    throw error;
  }
}

function startUpdateStatus () {
  if (!updateStatus || typeof updateStatus.execute !== 'function') {
    logger.error(
      'updateStatus.execute est introuvable ou n\'est pas une fonction, status update skipped'
    );
    return;
  }

  (async () => {
    try {
      await updateStatus.execute(client);
    } catch (error) {
      logger.error('Erreur dans updateStatus (appel initial) :', error);
      errorHandler.handleTaskError(error, 'UPDATE_STATUS');
    }
  })();

  const intervalMs = Number(updateStatus.interval ?? 60000);
  if (!Number.isFinite(intervalMs) || intervalMs < 10000) {
    throw new Error(
      `updateStatus.interval invalide (${updateStatus.interval}). Valeur minimale: 10000ms.`
    );
  }

  updateStatusInterval = setInterval(() => {
    if (typeof updateStatus.execute === 'function') {
      updateStatus.execute(client).catch((error) => {
        logger.error('Erreur dans updateStatus :', error);
        errorHandler.handleTaskError(error, 'UPDATE_STATUS');
      });
    } else {
      logger.error(
        'updateStatus.execute est undefined pendant l\'intervalle, arret du setInterval'
      );
      clearInterval(updateStatusInterval);
    }
  }, intervalMs);
}

export async function stopBot () {
  try {
    if (updateStatusInterval) {
      clearInterval(updateStatusInterval);
    }

    if (client) {
      await client.destroy();
    }

    logger.success('soundSHINE Bot arrete proprement');
  } catch (error) {
    errorHandler.handleCriticalError(error, 'BOT_SHUTDOWN');
    logger.error('Erreur lors de l\'arret du bot:', error);
    throw error;
  }
}
