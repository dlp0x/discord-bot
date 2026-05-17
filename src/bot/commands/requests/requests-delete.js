import { MessageFlags } from 'discord.js';
import { database as db } from '../../../utils/database/database.js';
import logger from '#shared/logging/logger.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('delete')
      .setDescription('Supprimer une suggestion.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('ID de la suggestion')
          .setRequired(true)),

  async execute (interaction) {
    const suggestionId = interaction.options.getInteger('id');

    if (!suggestionId) {
      return interaction.reply({
        content: '❌ ID de suggestion invalide.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      const [suggestion] = await db.query(
        'SELECT * FROM suggestions WHERE id = ?',
        [suggestionId]
      );

      if (!suggestion) {
        return interaction.reply({
          content: '❌ Suggestion introuvable.',
          flags: MessageFlags.Ephemeral
        });
      }

      await db.query('DELETE FROM suggestions WHERE id = ?', [suggestionId]);

      return await interaction.reply(
        `Suggestion **${suggestion.titre}** supprimée avec succès.`
      );
    } catch (error) {
      logger.error('Erreur suppression suggestion:', error);
      return await interaction.reply({
        content: '❌ Erreur lors de la suppression de la suggestion.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

