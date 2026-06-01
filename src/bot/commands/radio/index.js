import { SlashCommandBuilder } from 'discord.js';
import nowplayingSubcommand from './nowplaying.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Commandes pour contrôler la radio')
    .setDMPermission(false)
    .addSubcommand(nowplayingSubcommand.builder),

  async execute (interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
    case 'nowplaying':
      return await nowplayingSubcommand.execute(interaction);
    default:
      return await interaction.reply({
        content: '❌ Sous-commande inconnue.',
        ephemeral: true
      });
    }
  }
};
