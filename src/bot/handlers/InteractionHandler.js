import { MessageFlags } from 'discord.js';
// ========================================
// bot/events/handlers/InteractionHandler.js - Handler amélioré pour les interactions
// ========================================

import logger from '../logger.js';
import { handleTempVcButton, handleTempVcModal, isTempVcButton } from '../services/tempVcService.js';
const COMPACT_LOGS = process.env.COMPACT_LOGS === 'true';

/**
 * Traite une interaction selon son type
 * @param {Object} interaction - L'interaction Discord
 * @param {Object} client - Client Discord
 * @param {Object} db - Instance de base de données
 * @param {Object} config - Configuration
 * @returns {Object} Résultat du traitement
 */
export async function handleInteractionByType (interaction, client, db, config) {
  try {
    if (!COMPACT_LOGS) {
      logger.debug(
        `Traitement de l'interaction ${
          interaction.commandName || interaction.customId
        }`,
        {
          userId: interaction.user.id,
          commandName: interaction.commandName || interaction.customId,
          timestamp: new Date().toISOString()
        }
      );
    }

    // Gestion des slash commands
    if (interaction.isChatInputCommand()) {
      return await handleSlashCommand(interaction, client, db, config);
    }

    // Gestion des boutons
    if (interaction.isButton()) {
      return await handleButton(interaction, client, db, config);
    }

    // Gestion des select menus
    if (interaction.isStringSelectMenu()) {
      return await handleSelectMenu(interaction, client, db, config);
    }

    // Gestion des modals
    if (interaction.isModalSubmit()) {
      return await handleModal(interaction, client, db, config);
    }

    // Type d'interaction non supporté
    logger.warn(`Type d'interaction non supporté: ${interaction.type}`);
    return {
      success: false,
      message: '❌ Type d\'interaction non supporté.',
      flags: MessageFlags.Ephemeral
    };
  } catch (error) {
    logger.error(
      `Erreur dans handleInteractionByType: ${error.message}`,
      error
    );
    return {
      success: false,
      message: '❌ Erreur lors du traitement de l\'interaction.',
      flags: MessageFlags.Ephemeral
    };
  }
}

/**
 * Traite une slash command
 * @param {Object} interaction - L'interaction de commande
 * @param {Object} client - Client Discord
 * @param {Object} db - Instance de base de données
 * @param {Object} config - Configuration
 * @returns {Object} Résultat de l'exécution
 */
async function handleSlashCommand (interaction, client, db, config) {
  const { commandName } = interaction;

  try {
    // Vérifier si la commande existe
    const command = client.commands?.get(commandName);
    if (!command) {
      logger.warn(`Commande "${commandName}" non trouvée dans client.commands`);
      logger.debug(
        `Commandes disponibles: ${Array.from(
          client.commands?.keys() || []
        ).join(', ')}`
      );

      return {
        success: false,
        message: `❌ La commande "${commandName}" n'existe pas.`,
        flags: MessageFlags.Ephemeral
      };
    }

    // Vérifier que la fonction execute existe
    if (typeof command.execute !== 'function') {
      logger.error(
        `La commande "${commandName}" n'a pas de méthode execute valide`
      );
      return {
        success: false,
        message: `❌ Erreur de configuration de la commande "${commandName}".`,
        flags: MessageFlags.Ephemeral
      };
    }

    if (!COMPACT_LOGS)
      logger.debug(`Exécution de la commande "${commandName}"`);

    // Exécuter la commande avec contexte enrichi
    const context = {
      client,
      db,
      config,
      interaction,
      user: interaction.user,
      guild: interaction.guild,
      channel: interaction.channel
    };

    // Exécuter la commande
    const result = await command.execute(interaction, context);

    // Normaliser le résultat
    const normalizedResult = normalizeCommandResult(result, commandName);

    if (!COMPACT_LOGS)
      logger.debug(`Commande "${commandName}" exécutée avec succès`);
    return normalizedResult;
  } catch (error) {
    logger.error(`Erreur dans la commande ${commandName}:`, {
      error: error.message,
      stack: error.stack,
      userId: interaction.user.id
    });

    return {
      success: false,
      message: `❌ Erreur lors de l'exécution de la commande ${commandName}.`,
      flags: MessageFlags.Ephemeral
    };
  }
}

/**
 * Traite les interactions de bouton
 * @param {Object} interaction - L'interaction de bouton
 * @param {Object} client - Client Discord
 * @param {Object} db - Instance de base de données
 * @param {Object} config - Configuration
 * @returns {Object} Résultat du traitement
 */
async function handleButton (interaction) {
  const { customId } = interaction;

  try {
    logger.info(`Traitement du bouton: ${customId}`);

    if (isTempVcButton(customId)) {
      const result = await handleTempVcButton(interaction);
      if (result) return result;
    }

    // Ici vous pourriez avoir un système de handlers de boutons
    // Pour l'exemple, on traite quelques cas courants

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

    // Bouton non reconnu
    const { handleButtonInteraction } = await import('./ButtonHandler.js');
    return await handleButtonInteraction(interaction);
  } catch (error) {
    logger.error(`Erreur lors du traitement du bouton ${customId}:`, error);
    return {
      success: false,
      message: '❌ Erreur lors du traitement du bouton.',
      flags: MessageFlags.Ephemeral
    };
  }
}

/**
 * Traite les select menus
 * @param {Object} interaction - L'interaction de select menu
 * @param {Object} client - Client Discord
 * @param {Object} db - Instance de base de données
 * @param {Object} config - Configuration
 * @returns {Object} Résultat du traitement
 */
async function handleSelectMenu (interaction) {
  const { customId } = interaction;
  const selectedValues = interaction.values;

  try {
    logger.info(`Traitement du select menu: ${customId}`, { selectedValues });

    // Exemple de traitement de select menu
    await interaction.reply({
      content: `Vous avez sélectionné: ${selectedValues.join(', ')}`,
      flags: MessageFlags.Ephemeral
    });

    return { success: true, message: 'SELECT_MENU_HANDLED' };
  } catch (error) {
    logger.error(
      `Erreur lors du traitement du select menu ${customId}:`,
      error
    );
    return {
      success: false,
      message: '❌ Erreur lors du traitement de la sélection.',
      flags: MessageFlags.Ephemeral
    };
  }
}

/**
 * Traite les soumissions de modal
 * @param {Object} interaction - L'interaction de modal
 * @param {Object} client - Client Discord
 * @param {Object} db - Instance de base de données
 * @param {Object} config - Configuration
 * @returns {Object} Résultat du traitement
 */
async function handleModal (interaction) {
  const { customId } = interaction;

  try {
    logger.info(`Traitement du modal: ${customId}`);

    const tempVcResult = await handleTempVcModal(interaction);
    if (tempVcResult) {
      return tempVcResult;
    }

    // Récupérer les valeurs des champs
    const fields = {};
    interaction.components.forEach((row) => {
      row.components.forEach((component) => {
        fields[component.customId] = component.value;
      });
    });

    logger.debug('Données du modal:', fields);

    // Exemple de traitement
    await interaction.reply({
      content: '✅ Formulaire soumis avec succès!',
      flags: MessageFlags.Ephemeral
    });

    return { success: true, message: 'MODAL_HANDLED' };
  } catch (error) {
    logger.error(`Erreur lors du traitement du modal ${customId}:`, error);
    return {
      success: false,
      message: '❌ Erreur lors du traitement du formulaire.',
      flags: MessageFlags.Ephemeral
    };
  }
}

/**
 * Normalise le résultat d'une commande pour une gestion cohérente
 * @param {*} result - Résultat brut de la commande
 * @param {string} commandName - Nom de la commande
 * @returns {Object} Résultat normalisé
 */
function normalizeCommandResult (result, commandName) {
  // Si c'est déjà un objet avec success, on le retourne tel quel
  if (result && typeof result === 'object' && 'success' in result) {
    return result;
  }

  // Si c'est un string, on le traite comme un message de succès
  if (typeof result === 'string') {
    return {
      success: true,
      message: result,
      ephemeral: false
    };
  }

  // Si c'est un objet Discord (embed, components, etc.)
  if (result && typeof result === 'object') {
    return {
      success: true,
      ...result,
      ephemeral: result.ephemeral !== undefined ? result.ephemeral : false
    };
  }

  // Si c'est undefined/null, succès silencieux
  if (result === undefined || result === null) {
    return {
      success: true,
      message: `✅ Commande ${commandName} exécutée avec succès.`,
      ephemeral: false
    };
  }

  // Fallback pour les autres types
  logger.warn(`Type de résultat inattendu pour ${commandName}:`, typeof result);
  return {
    success: true,
    message: `✅ Commande ${commandName} exécutée.`,
    ephemeral: false
  };
}

