// ========================================
// bot/services/ServiceManager.js
// Conteneur de services extensible (singleton-friendly)
// ========================================

import cache from '#core/services/CacheService.js';
import * as radio from './radioPlaybackService.js';


let serviceContainer = null;

export function createServices () {
  if (serviceContainer) {
    return serviceContainer;
  }

  serviceContainer = {
    cache,
    radio
  };

  return serviceContainer;
}

export default createServices;

