import { MessageFlags } from 'discord.js';
// ========================================
// bot/events/handlers/InteractionHandler.js - Handler amélioré pour les interactions
// ========================================

import logger from '../logger.js';
import {
  handleTempVcButton,
  handleTempVcModal,
  isTempVcButton
} from '../services/tempVcService.js';

const COMPACT_LOGS = process.env.COMPACT_LOGS === 'true';

function failResult (message) {
  return {
    success: false,
    message,
    flags: MessageFlags.Ephemeral
  };
}

export async function handleInteractionByType (interaction, client, db, config) {
  try {
    if (!COMPACT_LOGS) {
      logger.debug(
        `Traitement de l'interaction ${interaction.commandName || interaction.customId}`,
        {
          userId: interaction.user.id,
          commandName: interaction.commandName || interaction.customId,
          timestamp: new Date().toISOString()
        }
      );
    }

    if (interaction.isChatInputCommand()) {
      return await handleSlashCommand(interaction, client, db, config);
    }

    if (interaction.isButton()) {
      return await handleButton(interaction, client, db, config);
    }

    if (interaction.isStringSelectMenu()) {
      return await handleSelectMenu(interaction, client, db, config);
    }

    if (interaction.isModalSubmit()) {
      return await handleModal(interaction, client, db, config);
    }

    logger.warn(`Type d'interaction non supporté: ${interaction.type}`);
    return failResult('❌ Type d\'interaction non supporté.');
  } catch (error) {
    logger.error(`Erreur dans handleInteractionByType: ${error.message}`, error);
    return failResult('❌ Erreur lors du traitement de l\'interaction.');
  }
}

async function handleSlashCommand (interaction, client, db, config) {
  const { commandName } = interaction;

  try {
    const command = client.commands?.get(commandName);
    if (!command) {
      logger.warn(`Commande "${commandName}" non trouvée dans client.commands`);
      logger.debug(`Commandes disponibles: ${Array.from(client.commands?.keys() || []).join(', ')}`);
      return failResult(`❌ La commande "${commandName}" n'existe pas.`);
    }

    if (typeof command.execute !== 'function') {
      logger.error(`La commande "${commandName}" n'a pas de méthode execute valide`);
      return failResult(`❌ Erreur de configuration de la commande "${commandName}".`);
    }

    if (!COMPACT_LOGS) {
      logger.debug(`Exécution de la commande "${commandName}"`);
    }

    const context = {
      client,
      db,
      config,
      interaction,
      user: interaction.user,
      guild: interaction.guild,
      channel: interaction.channel
    };

    const result = await command.execute(interaction, context);
    const normalizedResult = normalizeCommandResult(result, commandName);

    if (!COMPACT_LOGS) {
      logger.debug(`Commande "${commandName}" exécutée avec succès`);
    }

    return normalizedResult;
  } catch (error) {
    logger.error(`Erreur dans la commande ${commandName}:`, {
      error: error.message,
      stack: error.stack,
      userId: interaction.user.id
    });

    return failResult(`❌ Erreur lors de l'exécution de la commande ${commandName}.`);
  }
}

async function handleButton (interaction) {
  const { customId } = interaction;

  try {
    logger.info(`Traitement du bouton: ${customId}`);

    if (isTempVcButton(customId)) {
      const result = await handleTempVcButton(interaction);
      if (result) return result;
    }

    if (customId.startsWith('confirm_')) {
      await interaction.update({
        content: '✅ Action confirmée!',
        components: []
      });
      return { success: true, message: 'BUTTON_HANDLED' };
    }

    if (customId.startsWith('cancel_')) {
      await interaction.update({
        content: '❌ Action annulée.',
        components: []
      });
      return { success: true, message: 'BUTTON_HANDLED' };
    }

    const { handleButtonInteraction } = await import('./ButtonHandler.js');
    return await handleButtonInteraction(interaction);
  } catch (error) {
    logger.error(`Erreur lors du traitement du bouton ${customId}:`, error);
    return failResult('❌ Erreur lors du traitement du bouton.');
  }
}

async function handleSelectMenu (interaction) {
  const { customId } = interaction;
  const selectedValues = interaction.values;

  try {
    logger.info(`Traitement du select menu: ${customId}`, { selectedValues });

    await interaction.reply({
      content: `Vous avez sélectionné: ${selectedValues.join(', ')}`,
      flags: MessageFlags.Ephemeral
    });

    return { success: true, message: 'SELECT_MENU_HANDLED' };
  } catch (error) {
    logger.error(`Erreur lors du traitement du select menu ${customId}:`, error);
    return failResult('❌ Erreur lors du traitement de la sélection.');
  }
}

async function handleModal (interaction) {
  const { customId } = interaction;

  try {
    logger.info(`Traitement du modal: ${customId}`);

    const tempVcResult = await handleTempVcModal(interaction);
    if (tempVcResult) {
      return tempVcResult;
    }

    const fields = {};
    interaction.components.forEach((row) => {
      row.components.forEach((component) => {
        fields[component.customId] = component.value;
      });
    });

    logger.debug('Données du modal:', fields);

    await interaction.reply({
      content: '✅ Formulaire soumis avec succès!',
      flags: MessageFlags.Ephemeral
    });

    return { success: true, message: 'MODAL_HANDLED' };
  } catch (error) {
    logger.error(`Erreur lors du traitement du modal ${customId}:`, error);
    return failResult('❌ Erreur lors du traitement du formulaire.');
  }
}

function normalizeCommandResult (result, commandName) {
  if (result && typeof result === 'object' && 'success' in result) {
    return result;
  }

  if (typeof result === 'string') {
    return {
      success: true,
      message: result,
      ephemeral: false
    };
  }

  if (result && typeof result === 'object') {
    return {
      success: true,
      ...result,
      ephemeral: result.ephemeral !== undefined ? result.ephemeral : false
    };
  }

  if (result === undefined || result === null) {
    return {
      success: true,
      message: `✅ Commande ${commandName} exécutée avec succès.`,
      ephemeral: false
    };
  }

  logger.warn(`Type de résultat inattendu pour ${commandName}:`, typeof result);
  return {
    success: true,
    message: `✅ Commande ${commandName} exécutée.`,
    ephemeral: false
  };
}
