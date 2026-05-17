import { MessageFlags } from 'discord.js';
import { listRequests } from '../../../utils/bot/radioDjApi.js';
import logger from '#shared/logging/logger.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('list')
      .setDescription('Voir les requests en attente'),

  async execute (interaction) {
    try {
      const requests = await listRequests();

      if (requests.length === 0) {
        return await interaction.reply({
          content: 'Aucune request en attente.',
          flags: MessageFlags.Ephemeral
        });
      }

      const msg = requests
        .map((r, index) => `**${index + 1}.** ${r.title} - ${r.artist} (${r.requests} requests)`)
        .join('\n');

      return await interaction.reply({
        content: msg.slice(0, 2000),
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Erreur lors de la recuperation des requests via l\'API:', error);
      return await interaction.reply({
        content: 'Erreur lors de la recuperation des requests via l\'API.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
