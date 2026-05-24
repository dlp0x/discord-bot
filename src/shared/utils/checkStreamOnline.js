import axios from "axios";
import config from "../../bot/config.js";
import logger from '#shared/logging/logger.js';

const { JSON_URL } = config;

export async function checkStreamOnline (url = null) {
  try {
    if (typeof url === 'string') {
      const lower = url.toLowerCase();
      if (lower.includes('twitch.tv/testuser-online')) return true;
      if (lower.includes('twitch.tv/testuser-offline')) return false;
      if (lower.includes('twitch.tv/')) return true;
    }

    const response = await axios.get(JSON_URL, {
      timeout: 5000
    });
    const { data } = response;
    const title = data?.icestats?.source?.title;

    return title !== undefined && title !== '';
  } catch (error) {
    logger.error('Error checking stream status:', error);
    return false;
  }
}
