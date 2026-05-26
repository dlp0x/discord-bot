import { MessageFlags } from 'discord.js';
import { addRequest } from '#core/services/radioDjApi.js';
import logger from '#shared/logging/logger.js';

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
          .setRequired(true)),

  async execute (interaction) {
    try {
      const titre = interaction.options.getString('titre');
      const artiste = interaction.options.getString('artiste');
      const username = interaction.user.tag;



      await addRequest({ artist: artiste, title: titre, requestedBy: username });


      return await interaction.reply({
        content: 'Ta demande a ete ajoutee dans RadioDJ.',
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Erreur lors de l\'ajout de la demande via l\'API:', error);

      if (error?.response?.status === 404) {
        return await interaction.reply({
          content: 'Morceau introuvable dans RadioDJ. Verifie le titre et l\'artiste exacts avec `/requests search`.',
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
