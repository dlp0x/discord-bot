// ========================================
// bot/handlers/loadEvents.js (ESM)
// ========================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import logger from '#shared/logging/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getEventFiles (dirPath) {
  const files = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryName = typeof entry === 'string' ? entry : entry.name;
    const fullPath = path.join(dirPath, entryName);

    if (typeof entry === 'string') {
      if (entryName.endsWith('.js')) {
        files.push(fullPath);
      }
    } else if (entry.isDirectory()) {
      files.push(...getEventFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function loadEvents (client, importFn = (src) => import(src)) {
  try {
    const eventsPath = path.join(__dirname, '../events');

    if (!fs.existsSync(eventsPath)) {
      logger.warn('Dossier events introuvable.');
      return { loaded: [], failed: [], total: 0 };
    }

    const files = getEventFiles(eventsPath);

    if (files.length) {
      logger.section('Événements');
    }

    const loadedEvents = [];
    const failedEvents = [];

    for (const filePath of files) {
      const file = filePath.split(/[/\\]/).pop() ?? filePath;

      try {
        const fileModule = await importFn(pathToFileURL(filePath).href);

        if (
          fileModule.default?.name
          && typeof fileModule.default.execute === 'function'
        ) {
          const handler = (...args) =>
            fileModule.default.execute(...args, client);

          if (fileModule.default.once) {
            client.once(fileModule.default.name, handler);
          } else {
            client.on(fileModule.default.name, handler);
          }

          logger.event(
            `Événement chargé : ${fileModule.default.name}`
          );
          loadedEvents.push(fileModule.default.name);
        } else {
          logger.warn(`Événement invalide dans ${file}`);
          failedEvents.push(file);
        }
      } catch (err) {
        logger.error(`Erreur lors du chargement de ${file} : ${err.message}`);
        failedEvents.push(file);
      }
    }

    logger.success(`${loadedEvents.length} événements chargés avec succès`);
    if (failedEvents.length > 0) {
      logger.warn(`${failedEvents.length} événements en échec`);
    }

    return {
      loaded: loadedEvents,
      failed: failedEvents,
      total: files.length
    };
  } catch (err) {
    logger.error(`Erreur lors du chargement des événements : ${err.message}`);
    return { loaded: [], failed: [], total: 0 };
  }
}
