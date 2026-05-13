import { MessageFlags } from 'discord.js';
// ========================================
// bot/handlers/CommandHandler.js
// Handler central: metadata, permissions, cooldown, defer, erreurs
// ========================================

import config from '../config.js';
import logger from '../logger.js';

const DEFAULT_METADATA = {
  category: 'general',
  requiresAdmin: false,
  deferReply: false,
  ephemeral: false,
  cooldown: 0
};

export default class CommandHandler {
  constructor () {
    this.cooldowns = new Map();
  }

  getMetadata (command) {
    return {
      ...DEFAULT_METADATA,
      ...(command?.meta || {})
    };
  }

  async handle (interaction, context) {
    const commandName = interaction.commandName;
    const command = context.client.commands?.get(commandName);

    if (!command) {
      logger.warn(`[CMD] Commande introuvable: ${commandName}`);
      return {
        success: false,
        message: `❌ La commande "${commandName}" n'existe pas.`,
        flags: MessageFlags.Ephemeral
      };
    }

    const meta = this.getMetadata(command);
    const commandContext = {
      ...context,
      services: context.services || {},
      metadata: meta
    };

    const permissionError = this.checkPermissions(interaction, meta);
    if (permissionError) {
      return permissionError;
    }

    const cooldownError = this.checkCooldown(interaction, commandName, meta);
    if (cooldownError) {
      return cooldownError;
    }

    await this.autoDeferIfNeeded(interaction, meta);

    logger.info(`[CMD] ${commandName} execute`, {
      category: meta.category,
      requiresAdmin: meta.requiresAdmin,
      deferReply: meta.deferReply
    });

    try {
      const result = await command.execute(interaction, commandContext);
      return this.normalizeResult(result, meta, commandName, interaction);
    } catch (error) {
      logger.error(`[CMD] ${commandName} error: ${error.message}`, error);
      return {
        success: false,
        message: '❌ Une erreur est survenue lors du traitement de la commande.',
        flags: MessageFlags.Ephemeral
      };
    }
  }

  checkPermissions (interaction, meta) {
    if (!meta.requiresAdmin) {
      return null;
    }

    const isAdminRole = interaction.member?.roles?.cache?.has(config.ADMIN_ROLE_ID);
    const isAdminUser = config.ADMIN_USER_ID && interaction.user?.id === config.ADMIN_USER_ID;

    if (isAdminRole || isAdminUser) {
      return null;
    }

    logger.warn(`[CMD] permission denied`, {
      command: interaction.commandName,
      userId: interaction.user?.id
    });

    return {
      success: false,
      message: '❌ Cette commande est réservée aux administrateurs.',
      flags: MessageFlags.Ephemeral
    };
  }

  checkCooldown (interaction, commandName, meta) {
    if (!meta.cooldown || meta.cooldown <= 0) {
      return null;
    }

    const key = `${commandName}:${interaction.user.id}`;
    const now = Date.now();
    const endsAt = this.cooldowns.get(key);

    if (endsAt && endsAt > now) {
      const remainingSec = Math.ceil((endsAt - now) / 1000);
      return {
        success: false,
        message: `⏳ Merci d'attendre ${remainingSec}s avant de réutiliser cette commande.`,
        flags: MessageFlags.Ephemeral
      };
    }

    this.cooldowns.set(key, now + meta.cooldown * 1000);
    return null;
  }

  async autoDeferIfNeeded (interaction, meta) {
    if (!meta.deferReply) return;
    if (interaction.deferred || interaction.replied) return;

    await interaction.deferReply({ ephemeral: meta.ephemeral });
    logger.debug(`[CMD] ${interaction.commandName} deferred automatiquement`);
  }

  normalizeResult (result, meta, commandName, interaction) {
    if (result && typeof result === 'object' && 'success' in result) {
      return {
        ephemeral: meta.ephemeral,
        ...result,
        ephemeral: result.ephemeral ?? meta.ephemeral
      };
    }

    if (typeof result === 'string') {
      return {
        success: true,
        message: result,
        ephemeral: meta.ephemeral
      };
    }

    if (result && typeof result === 'object') {
      return {
        success: true,
        ...result,
        ephemeral: result.ephemeral ?? meta.ephemeral
      };
    }

    if (interaction.replied || interaction.deferred) {
      return {
        success: true,
        message: 'INTERACTION_ALREADY_HANDLED',
        ephemeral: meta.ephemeral
      };
    }

    return {
      success: true,
      message: `✅ Commande ${commandName} exécutée.`,
      ephemeral: meta.ephemeral
    };
  }
}

