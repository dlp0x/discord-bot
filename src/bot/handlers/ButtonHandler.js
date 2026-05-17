// ========================================
// bot/events/handlers/ButtonHandler.js - Gestion des interactions de boutons
// ========================================

import logger from '../../shared/logging/logger.js';
import { safeStringify } from '../utils/SafeStringify.js';

/**
 * Traiter une interaction de bouton
 */
export async function handleButtonInteraction (interaction, _client, _db, _config) {
  const { customId } = interaction;

  try {
    if (customId.startsWith('suggestion_')) {
      return await handleSuggestionButton(interaction);
    }

    if (customId === 'schedule_fr' || customId === 'schedule_en') {
      return await handleScheduleButton(interaction, customId);
    }

    if (customId === 'show_full_stats') {
      return await handleFullStatsButton(interaction);
    }

    // Bouton non reconnu
    await interaction.reply({
      content: '❌ Bouton non reconnu',
      flags: 64 // MessageFlags.Ephemeral
    });
    return { success: true, message: 'BUTTON_HANDLED', ephemeral: false };
  } catch (error) {
    logger.error('Erreur lors du traitement du bouton:', error);
    try {
      await interaction.reply({
        content: '❌ Une erreur est survenue lors du traitement du bouton.',
        flags: 64 // MessageFlags.Ephemeral
      });
    } catch (replyError) {
      logger.error(
        'Impossible d\'envoyer la réponse d\'erreur pour le bouton:',
        replyError
      );
    }
    return { success: true, message: 'BUTTON_HANDLED', ephemeral: false };
  }
}

/**
 * Gérer les boutons de suggestion
 */
async function handleSuggestionButton (interaction) {
  // Traitement des boutons de suggestion...
  await interaction.reply({
    content: 'Action effectuée avec succès!',
    flags: 64 // MessageFlags.Ephemeral
  });
  return { success: true, message: 'BUTTON_HANDLED', ephemeral: false };
}

/**
 * Gérer les boutons de planning
 */
async function handleScheduleButton (interaction, customId) {
  const scheduleService = (
    await import('../../core/services/ScheduleService.js')
  ).default;
  const { EmbedBuilder } = await import('discord.js');

  const language = customId === 'schedule_fr' ? 'fr' : 'en';
  const schedule = await scheduleService.getFormattedSchedule(language);

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(language === 'fr' ? 0xf1c40f : 0x2ecc71)
        .setTitle(schedule.title)
        .setDescription(schedule.content)
    ],
    components: []
  });

  return { success: true, message: 'BUTTON_HANDLED', ephemeral: false };
}

/**
 * Gérer le bouton des statistiques complètes
 */
async function handleFullStatsButton (interaction) {
  try {
    const axios = (await import('axios')).default;
    const config = (await import('../config.js')).default;

    const { data } = await axios.get(config.JSON_URL);

    await interaction.update({
      content: `📊 **Stats complètes Icecast**\n\`\`\`json\n${safeStringify(
        data
      )}\n\`\`\``,
      components: []
    });
  } catch (error) {
    logger.error('Erreur stats complètes:', error);
    await interaction.update({
      content: '❌ Impossible de récupérer les stats complètes.',
      components: []
    });
  }

  return { success: true, message: 'BUTTON_HANDLED', ephemeral: false };
}
