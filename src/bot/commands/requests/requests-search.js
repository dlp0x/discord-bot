import { MessageFlags } from 'discord.js';
import { searchSongs } from '#api/services/radioDjApi.js';
import logger from '#shared/logging/logger.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('search')
      .setDescription('Rechercher un morceau dans RadioDJ')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Titre ou artiste')
          .setRequired(true))
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription('Nombre de resultats (max 10)')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(false)),

  async execute (interaction) {
    try {
      const query = interaction.options.getString('query');
      const limit = interaction.options.getInteger('limit') ?? 5;

      const songs = await searchSongs(query, limit);

      if (songs.length === 0) {
        return await interaction.reply({
          content: 'Aucun resultat trouve.',
          flags: MessageFlags.Ephemeral
        });
      }

      const msg = songs
        .map((song, index) => `**${index + 1}.** ${song.artist} - ${song.title}`)
        .join('\n');

      return await interaction.reply({
        content: msg.slice(0, 2000),
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Erreur lors de la recherche de morceaux via l\'API:', error);
      return await interaction.reply({
        content: 'Erreur lors de la recherche via l\'API.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
