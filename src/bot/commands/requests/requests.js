import { MessageFlags } from 'discord.js';
import { validateURL } from '../../../utils/bot/validateURL.js';
import { genres } from '../../../utils/bot/genres.js';
import { addRequest } from '../../../utils/bot/radioDjApi.js';
import config from '../../config.js';
import logger from '../../logger.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('add')
      .setDescription('Faire une demande speciale')
      .addStringOption((option) =>
        option
          .setName('artiste')
          .setDescription('L\'artiste')
          .setRequired(true))
      .addStringOption((option) =>
        option
          .setName('titre')
          .setDescription('Le titre du morceau')
          .setRequired(true))
      .addStringOption((option) =>
        option
          .setName('lien')
          .setDescription('URL Youtube ou Spotify')
          .setRequired(false))
      .addStringOption((option) =>
        option
          .setName('genre')
          .setDescription('Le genre musical')
          .setRequired(false)
          .addChoices(
            ...genres.map((g) => ({
              name: g,
              value: g.toLowerCase().replace(/\s/g, '_')
            }))
          )),

  async execute (interaction) {
    try {
      const titre = interaction.options.getString('titre');
      const artiste = interaction.options.getString('artiste');
      const lien = interaction.options.getString('lien');
      const genre = interaction.options.getString('genre') ?? '';
      const username = interaction.user.tag;

      if (lien && !validateURL(lien)) {
        return await interaction.reply({
          content: 'Ton lien n\'est pas valide.',
          flags: MessageFlags.Ephemeral
        });
      }

      await addRequest({ artist: artiste, title: titre });

      const privateChannel = interaction.client.channels.cache.get(
        config.reqChannelId
      );
      if (privateChannel) {
        const requestMessage = [
          'Nouvelle request',
          `- Titre: ${titre}`,
          `- Artiste: ${artiste}`,
          `- Lien: ${lien ?? ''}`,
          `- Genre: ${genre}`,
          `- Propose par: ${username}`
        ].join('\n');

        await privateChannel.send(
          requestMessage
        );
      }

      return await interaction.reply({
        content: 'Ta demande a ete ajoutee dans RadioDJ.',
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Erreur lors de l\'ajout de la demande via l\'API:', error);

      if (error?.response?.status === 404) {
        return await interaction.reply({
          content: 'Morceau introuvable dans RadioDJ. Verifie le titre et l\'artiste exacts.',
          flags: MessageFlags.Ephemeral
        });
      }

      const apiMessage = error?.response?.data?.error;
      if (apiMessage) {
        return await interaction.reply({
          content: `Erreur API: ${apiMessage}`,
          flags: MessageFlags.Ephemeral
        });
      }

      return await interaction.reply({
        content: 'Erreur lors de l\'ajout de la demande via l\'API.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
