import { Events, MessageFlags } from 'discord.js';
import AppState from '../../core/services/AppState.js';
import { RetryManager } from '../../utils/shared/retry.js';
import { checkRateLimit, recordCommand } from '../../utils/shared/rateLimiter.js';
import {
  secureLogger,
  secureAudit,
  secureSecurityAlert
} from '../../utils/shared/secureLogger.js';
import logger from '../logger.js';
import CommandHandler from '../handlers/CommandHandler.js';
import config from '../config.js';
import { createServices } from '../services/ServiceManager.js';
import { validateInteractionInput } from '../handlers/ValidationHandler.js';
import { handleInteractionByType } from '../handlers/InteractionHandler.js';
import { getCommandType } from '../handlers/CommandTypeHandler.js';

const COMPACT_LOGS = process.env.COMPACT_LOGS === 'true';
const GENERIC_ERROR = '❌ Une erreur est survenue lors du traitement de votre demande.';

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
      `AppState - client: ${client ? 'defini' : 'undefined'}, db: ${db ? 'defini' : 'undefined'}`
    );

    const discordClient = client || interaction.client;
    const discordConfig = config;

    try {
      if (!interaction || !interaction.user) {
        logger.warn('Interaction invalide recue');
        return;
      }

      const userId = interaction.user.id;
      const commandName = interaction.commandName || interaction.customId || 'unknown';
      const interactionType = interaction.type || 'unknown';

      if (!COMPACT_LOGS) {
        secureAudit('Interaction Discord recue', userId, {
          commandName,
          interactionType,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          timestamp: new Date().toISOString()
        });
      }

      logger.info(`[CMD] ${commandName} start`, { userId, interactionType });

      const rateLimitResult = await handleRateLimit(interaction, userId, commandName);
      if (!rateLimitResult.allowed) {
        return;
      }

      const validationResult = await validateInteractionInput(interaction);
      if (!validationResult.valid) {
        await handleValidationError(interaction, validationResult, userId, commandName);
        return;
      }

      logger.debug(`Validation reussie pour la commande ${commandName}`);

      const commandType = getCommandType(commandName);
      recordCommand(userId, commandType);

      const result = await executeWithRetry(
        interaction,
        discordClient,
        db,
        discordConfig,
        commandName,
        interactionType,
        userId
      );

      await handleInteractionResponse(interaction, result, commandName);

      const duration = Date.now() - startTime;
      secureLogger.securePerformance(`Interaction ${commandName}`, duration, {
        userId,
        commandType,
        success: true
      });
      logger.info(`[CMD] ${commandName} success`, { userId, durationMs: duration });
    } catch (error) {
      await handleInteractionError(interaction, error, startTime);
    }
  }
};

async function safeReply (interaction, payload) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply(payload);
    return;
  }

  if (interaction.deferred) {
    await interaction.editReply(payload);
  }
}

function buildAutoReplyPayload (result) {
  if (result.message && typeof result.message === 'object') {
    return result.message;
  }

  return {
    content: result.message ?? result.content,
    embeds: result.embeds,
    components: result.components,
    ephemeral: result.ephemeral !== false
  };
}

async function handleRateLimit (interaction, userId, commandName) {
  const commandType = getCommandType(commandName);
  const rateLimitResult = checkRateLimit(userId, commandType);

  if (!rateLimitResult.allowed) {
    const remainingTime = Math.ceil(rateLimitResult.remainingTime / 1000);

    secureSecurityAlert(
      'Rate limit Discord depasse',
      {
        userId,
        commandName,
        commandType,
        remainingTime,
        reason: rateLimitResult.reason
      },
      userId
    );

    const errorMessage = rateLimitResult.reason === 'USER_BLOCKED'
      ? `Vous etes temporairement bloque. Reessayez dans ${remainingTime} secondes.`
      : `Trop de commandes. Reessayez dans ${remainingTime} secondes.`;

    await interaction.reply({
      content: `⚠️ ${errorMessage}`,
      flags: MessageFlags.Ephemeral
    });

    return { allowed: false };
  }

  return { allowed: true };
}

async function handleValidationError (interaction, validationResult, userId, commandName) {
  secureSecurityAlert(
    'Entree utilisateur invalide',
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
        logger.debug(`Debut du traitement de l'interaction ${commandName}`);

        if (interaction.isChatInputCommand()) {
          return await commandHandler.handle(interaction, {
            client: discordClient,
            logger,
            config: discordConfig,
            services
          });
        }

        return await handleInteractionByType(interaction, discordClient, db, discordConfig);
      },
      {
        maxAttempts: 3,
        baseDelay: 1000,
        context: { userId, commandName, interactionType }
      }
    );
  } catch (error) {
    logger.error(`Erreur dans RetryManager.execute: ${error.message}`, error);
    await safeReply(interaction, { content: GENERIC_ERROR, flags: MessageFlags.Ephemeral });
    throw error;
  }
}

async function handleInteractionResponse (interaction, result, commandName) {
  if (result && result.success) {
    logger.info(`Resultat de commande: ${result.message}, deferReply: ${result.deferReply}`);

    if (result.message === 'BUTTON_HANDLED') {
      logger.info('Bouton traite avec succes');
      return;
    }

    if (result.message === 'INTERACTION_ALREADY_HANDLED') {
      logger.debug('Interaction deja geree dans la commande');
      return;
    }

    if (result.deferReply) {
      logger.debug('Commande necessite deferReply, appel de interaction.deferReply()');
      if (!interaction.deferred) {
        await interaction.deferReply();
      }

      const { handleSpecialCommands } = await import('../handlers/SpecialCommandHandler.js');
      await handleSpecialCommands(interaction, result, commandName);
      return;
    }

    if (interaction.replied || interaction.deferred) {
      logger.debug('Interaction deja repondue/differee; saut de la reponse automatique');
      return;
    }

    logger.debug('Reponse normale avec interaction.reply()');
    const messagePayload = buildAutoReplyPayload(result);
    await interaction.reply({
      ...messagePayload,
      ephemeral: typeof messagePayload.ephemeral === 'boolean'
        ? messagePayload.ephemeral
        : result.ephemeral !== false
    });
    return;
  }

  logger.warn('Resultat de commande echoue ou null');
  await safeReply(interaction, {
    content: GENERIC_ERROR,
    flags: MessageFlags.Ephemeral
  });
}

async function handleInteractionError (interaction, error, startTime) {
  const duration = Date.now() - startTime;

  secureLogger.secureError('Erreur lors du traitement d\'interaction', error, {
    userId: interaction?.user?.id,
    commandName: interaction?.commandName || interaction?.customId,
    interactionType: interaction?.type,
    duration: `${duration}ms`
  });

  try {
    const errorMessage = interaction.replied || interaction.deferred
      ? GENERIC_ERROR
      : '❌ Une erreur inattendue s\'est produite.';

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
    } else if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage });
    }
  } catch (replyError) {
    if (replyError.message && replyError.message.includes('InteractionAlreadyReplied')) {
      logger.error('ERREUR InteractionAlreadyReplied detectee:', {
        error: replyError.message,
        interactionState: {
          replied: interaction.replied,
          deferred: interaction.deferred,
          commandName: interaction.commandName,
          userId: interaction.user?.id
        }
      });
    }
    logger.error('Impossible d\'envoyer la reponse d\'erreur', replyError);
  }
}
