import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import config from '../../config.js';
import logger from '#shared/logging/logger.js';

const { UNSPLASH_ACCESS_KEY } = config;

export default {
  data: new SlashCommandBuilder()
    .setName('getwallpaper')
    .setDescription('Récupère une photo aléatoire depuis Unsplash')
    .setDMPermission(false),
  async execute (interaction) {
    try {
      const response = await axios.get(
        `https://api.unsplash.com/photos/random?client_id=${UNSPLASH_ACCESS_KEY}&count=1`
      );

      const photoData = Array.isArray(response.data) ? response.data[0] : response.data;
      const photoUrl = photoData?.urls?.regular;

      if (photoUrl) {
        return await interaction.reply(photoUrl);
      } else {
        return await interaction.reply('Aucune image trouvée, réessaie plus tard.');
      }
    } catch (error) {
      logger.error('Erreur Unsplash: ', error);
      return await interaction.reply({
        content: 'Impossible de récupérer une image.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
