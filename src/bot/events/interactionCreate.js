// ========================================
// bot/events/interactionCreate.js - Point d'entrée principal pour les interactions Discord
// ========================================

import { Events, MessageFlags } from 'discord.js';
import AppState from '../../core/services/AppState.js';
import { RetryManager } from '../../utils/shared/retry.js';
import { checkRateLimit, recordCommand } from '../../utils/shared/rateLimiter.js';
import {
  secureLogger,
  secureAudit,
  secureSecurityAlert
} from '../../shared/logging/secureLogger.js';
import logger from '../../shared/logging/logger.js';
import CommandHandler from '../handlers/CommandHandler.js';
import config from '../config.js';
import { createServices } from '../services/ServiceManager.js';

// Mode logs compacts: ne garder que start/success et erreurs
const COMPACT_LOGS = process.env.COMPACT_LOGS === 'true';

// Import des handlers spécialisés
import { validateInteractionInput } from '../handlers/ValidationHandler.js';
import { handleInteractionByType } from '../handlers/InteractionHandler.js';
import { getCommandType } from '../handlers/CommandTypeHandler.js';
// import { safeStringify } from './utils/SafeStringify.js';

// Instance de RetryManager pour les interactions Discord
const interactionRetryManager = new RetryManager({
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'],
  onRetry: (error, attempt, delay) => {
    logger.warn(`Interaction retry ${attempt}: ${error.message} (${delay}ms)`);
  }
});

const commandHandler = new CommandHandler();
const services = createServices();

export default {
  name: Events.InteractionCreate,
  async execute (interaction) {
    const startTime = Date.now();
    const { client, db } = AppState;

    logger.debug(
      `AppState - client: ${client ? 'défini' : 'undefined'}, db: ${
        db ? 'défini' : 'undefined'
      }`
    );

    // Utiliser interaction.client comme fallback si AppState.client est undefined
    const discordClient = client || interaction.client;
    const discordConfig = config;

    try {
      // Validation de base de l'interaction
      if (!interaction || !interaction.user) {
        logger.warn('Interaction invalide reçue');
        return;
      }

      const userId = interaction.user.id;
      const commandName
        = interaction.commandName || interaction.customId || 'unknown';
      const interactionType = interaction.type || 'unknown';

      // Audit (désactivé si COMPACT_LOGS)
      if (!COMPACT_LOGS) {
        secureAudit('Interaction Discord reçue', userId, {
          commandName,
          interactionType,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          timestamp: new Date().toISOString()
        });
      }

      // Log de début (concis)
      logger.info(`[CMD] ${commandName} start`, {
        userId,
        interactionType
      });

      // Vérification du rate limiting
      const rateLimitResult = await handleRateLimit(
        interaction,
        userId,
        commandName
      );
      if (!rateLimitResult.allowed) {
        return;
      }

      // Validation et sanitization des entrées utilisateur
      const validationResult = await validateInteractionInput(interaction);
      if (!validationResult.valid) {
        await handleValidationError(
          interaction,
          validationResult,
          userId,
          commandName
        );
        return;
      }

      logger.debug(`Validation réussie pour la commande ${commandName}`);

      // Enregistrer l'exécution de la commande
      const commandType = getCommandType(commandName);
      recordCommand(userId, commandType);

      // Traitement de l'interaction avec retry
      const result = await executeWithRetry(
        interaction,
        discordClient,
        db,
        discordConfig,
        commandName,
        interactionType,
        userId
      );

      // Gestion de la réponse
      await handleInteractionResponse(interaction, result, commandName);

      // Log de performance + fin concise
      const duration = Date.now() - startTime;
      secureLogger.securePerformance(`Interaction ${commandName}`, duration, {
        userId,
        commandType,
        success: true
      });
      logger.info(`[CMD] ${commandName} success`, {
        userId,
        durationMs: duration
      });
    } catch (error) {
      await handleInteractionError(interaction, error, startTime);
    }
  }
};

/**
 * Gère le rate limiting pour une interaction
 */
async function handleRateLimit (interaction, userId, commandName) {
  const commandType = getCommandType(commandName);
  const rateLimitResult = checkRateLimit(userId, commandType);

  if (!rateLimitResult.allowed) {
    const remainingTime = Math.ceil(rateLimitResult.remainingTime / 1000);

    secureSecurityAlert(
      'Rate limit Discord dépassé',
      {
        userId,
        commandName,
        commandType,
        remainingTime,
        reason: rateLimitResult.reason
      },
      userId
    );

    const errorMessage
      = rateLimitResult.reason === 'USER_BLOCKED'
        ? `Vous êtes temporairement bloqué. Réessayez dans ${remainingTime} secondes.`
        : `Trop de commandes. Réessayez dans ${remainingTime} secondes.`;

    await interaction.reply({
      content: `⚠️ ${errorMessage}`,
      flags: MessageFlags.Ephemeral
    });

    return { allowed: false };
  }

  return { allowed: true };
}

/**
 * Gère les erreurs de validation
 */
async function handleValidationError (
  interaction,
  validationResult,
  userId,
  commandName
) {
  secureSecurityAlert(
    'Entrée utilisateur invalide',
    {
      userId,
      commandName,
      error: validationResult.error,
      input: validationResult.input
    },
    userId
  );

  await interaction.reply({
    content: `❌ ${validationResult.error}`,
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Exécute l'interaction avec retry
 */
async function executeWithRetry (
  interaction,
  discordClient,
  db,
  discordConfig,
  commandName,
  interactionType,
  userId
) {
  try {
    return await interactionRetryManager.execute(
      async () => {
        logger.debug(`Début du traitement de l'interaction ${commandName}`);

        if (interaction.isChatInputCommand()) {
          return await commandHandler.handle(interaction, {
            client: discordClient,
            logger,
            config: discordConfig,
            services
          });
        }

        const result = await handleInteractionByType(
          interaction,
          discordClient,
          db,
          discordConfig
        );
        // logger.debug(`Résultat de l'interaction: ${safeStringify(result)}`);
        return result;
      },
      {
        maxAttempts: 3,
        baseDelay: 1000,
        context: { userId, commandName, interactionType }
      }
    );
  } catch (error) {
    logger.error(`Erreur dans RetryManager.execute: ${error.message}`, error);

    // Vérifier si l'interaction a déjà été répondue avant d'essayer de répondre
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ Une erreur est survenue lors du traitement de votre demande.',
        flags: MessageFlags.Ephemeral
      });
    } else if (interaction.deferred) {
      await interaction.editReply({
        content:
          '❌ Une erreur est survenue lors du traitement de votre demande.'
      });
    }

    throw error;
  }
}

/**
 * Gère la réponse à l'interaction
 */
async function handleInteractionResponse (interaction, result, commandName) {
  // logger.debug(`Résultat final après RetryManager: ${safeStringify(result)}`);

  if (result && result.success) {
    logger.info(
      `Résultat de commande: ${result.message}, deferReply: ${result.deferReply}`
    );

    // Pour les boutons, on ne fait rien car ils sont déjà traités
    if (result.message === 'BUTTON_HANDLED') {
      logger.info('Bouton traité avec succès');
      return;
    }
    if (result.message === 'INTERACTION_ALREADY_HANDLED') {
      logger.debug('Interaction déjà gérée dans la commande');
      return;
    }

    // Gestion spéciale pour les commandes qui nécessitent deferReply
    if (result.deferReply) {
      logger.debug(
        'Commande nécessite deferReply, appel de interaction.deferReply()'
      );
      if (!interaction.deferred) {
        await interaction.deferReply();
      }

      // Import dynamique des handlers spéciaux
      const { handleSpecialCommands } = await import(
        '../handlers/SpecialCommandHandler.js'
      );
      await handleSpecialCommands(interaction, result, commandName);
    } else {
      // Éviter les doubles réponses si la commande a déjà répondu
      if (interaction.replied || interaction.deferred) {
        logger.debug(
          'Interaction déjà répondue/différée; saut de la réponse automatique'
        );
        return;
      }
      logger.debug('Réponse normale avec interaction.reply()');
      const messagePayload
        = result.message && typeof result.message === 'object'
          ? result.message
          : {
            content: result.message ?? result.content,
            embeds: result.embeds,
            components: result.components,
            ephemeral: result.ephemeral !== false
          };
      await interaction.reply({
        ...messagePayload,
        ephemeral:
          typeof messagePayload.ephemeral === 'boolean'
            ? messagePayload.ephemeral
            : result.ephemeral !== false
      });
    }
  } else {
    logger.warn('Résultat de commande échoué ou null');
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        content:
          '❌ Une erreur est survenue lors du traitement de votre demande.'
      });
    } else {
      await interaction.reply({
        content:
          '❌ Une erreur est survenue lors du traitement de votre demande.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Gère les erreurs d'interaction
 */
async function handleInteractionError (interaction, error, startTime) {
  const duration = Date.now() - startTime;

  // Log d'erreur sécurisé
  secureLogger.secureError('Erreur lors du traitement d\'interaction', error, {
    userId: interaction?.user?.id,
    commandName: interaction?.commandName || interaction?.customId,
    interactionType: interaction?.type,
    duration: `${duration}ms`
  });

  // Réponse d'erreur à l'utilisateur
  try {
    const errorMessage
      = interaction.replied || interaction.deferred
        ? '❌ Une erreur est survenue lors du traitement de votre demande.'
        : '❌ Une erreur inattendue s\'est produite.';

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    } else if (interaction.deferred) {
      await interaction.editReply({
        content: errorMessage
      });
    }
  } catch (replyError) {
    // Log spécifique pour l'erreur InteractionAlreadyReplied
    if (
      replyError.message
      && replyError.message.includes('InteractionAlreadyReplied')
    ) {
      logger.error('🚨 ERREUR InteractionAlreadyReplied détectée:', {
        error: replyError.message,
        interactionState: {
          replied: interaction.replied,
          deferred: interaction.deferred,
          commandName: interaction.commandName,
          userId: interaction.user?.id
        }
      });
    }
    logger.error('Impossible d\'envoyer la réponse d\'erreur', replyError);
  }
}
