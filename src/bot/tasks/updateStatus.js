import axios from 'axios';
import config from '../config.js';
import { ActivityType } from 'discord.js';
import logger from '#shared/logging/logger.js';
import monitor from '../../core/monitor.js';

const { JSON_URL } = config;
let lastSong = null;

async function updateStatus (client) {
  try {
    const { data } = await axios.get(JSON_URL, { timeout: 10000 });

    let currentSong = 'Stream offline or no song information available';

    if (data.icestats?.source) {
      const source = Array.isArray(data.icestats.source)
        ? data.icestats.source[0]
        : data.icestats.source;
      if (source?.title) {
        currentSong = source.title;
      }
    }

    if (currentSong !== lastSong) {
      logger.update(`Status to: ${currentSong}`);
      lastSong = currentSong;
    }

    await client.user.setActivity({
      name: `💿 ${currentSong}`,
      type: ActivityType.Custom,
      url: 'https://soundshineradio.com'
    });
  } catch (error) {
    monitor.handleTaskError(error, 'UPDATE_STATUS');
    logger.error('Error fetching metadata or updating status:', error);
    try {
      await client.user.setActivity({
        name: 'Soundshine Radio',
        type: ActivityType.Listening
      });
      logger.warn('Fallback activity set to Soundshine Radio');
    } catch (fallbackError) {
      monitor.handleTaskError(fallbackError, 'UPDATE_STATUS_FALLBACK');
      logger.error('Error setting fallback activity:', fallbackError);
    }
  }
}

export default {
  name: 'updateStatus',
  interval: 10000,
  execute: updateStatus
};
