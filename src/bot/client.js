// ========================================
// bot/client.js (ESM) - Singleton Discord Client robuste
// ========================================

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import logger from '#shared/logging/logger.js';

class DiscordClientSingleton {
  #client = null;
  #isInitialized = false;
  #isDestroyed = false;

  constructor () {
    if (DiscordClientSingleton._instance) {
      throw new Error('DiscordClientSingleton: Utilisez getInstance() !');
    }
    DiscordClientSingleton._instance = this;
  }

  static getInstance () {
    if (!DiscordClientSingleton._instance) {
      DiscordClientSingleton._instance = new DiscordClientSingleton();
    }
    return DiscordClientSingleton._instance;
  }

  createClient () {
    if (this.#client && this.#isInitialized && !this.#isDestroyed) {
      logger.warn('Client Discord déjà initialisé, retour du client existant');
      return this.#client;
    }
    if (this.#isDestroyed) {
      throw new Error(
        'Client Discord détruit, impossible de le réutiliser sans reset explicite (test uniquement)'
      );
    }
    try {
      this.#client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildVoiceStates
        ],
        ws: {
          properties: { browser: 'Discord iOS' }
        },
        rest: {
          timeout: 15000,
          retries: 3
        }
      });
      this.#client.commands = new Collection();
      this.#client.events = new Collection();
      this.#client.tasks = new Collection();
      if (
        !this.#client.commands
        || !this.#client.events
        || !this.#client.tasks
      ) {
        throw new Error('Échec de l\'initialisation des collections Discord');
      }
      this.#isInitialized = true;
      this.#isDestroyed = false;
      return this.#client;
    } catch (error) {
      logger.error(
        'Erreur critique lors de la création du client Discord:',
        error
      );
      this.#isInitialized = false;
      throw new Error(
        `Échec de l'initialisation du client Discord: ${error.message}`
      );
    }
  }

  getClient () {
    if (!this.#client || !this.#isInitialized || this.#isDestroyed) {
      throw new Error(
        'Client Discord non initialisé ou détruit. Appelez createClient() d\'abord.'
      );
    }
    return this.#client;
  }

  isReady () {
    return !!(
      this.#client
      && this.#isInitialized
      && !this.#isDestroyed
      && this.#client.isReady
      && this.#client.isReady()
    );
  }

  destroy () {
    if (this.#client && !this.#isDestroyed) {
      this.#client.destroy();
      this.#client = null;
      this.#isInitialized = false;
      this.#isDestroyed = true;
      logger.info('Client Discord détruit');
    }
  }

  // Pour les tests UNIQUEMENT
  _resetForTests () {
    this.#client = null;
    this.#isInitialized = false;
    this.#isDestroyed = false;
  }
}

// Export de l'instance unique et des méthodes d'accès
const discordClientSingleton = DiscordClientSingleton.getInstance();

export function createClient () {
  return discordClientSingleton.createClient();
}
export function getClient () {
  return discordClientSingleton.getClient();
}
export function isClientReady () {
  return discordClientSingleton.isReady();
}
export function destroyClient () {
  return discordClientSingleton.destroy();
}
// Pour les tests uniquement (ne pas exporter en prod)
// export function _resetDiscordClientForTests() { discordClientSingleton._resetForTests(); }

export default discordClientSingleton;

