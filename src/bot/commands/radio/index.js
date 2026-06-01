import { SlashCommandBuilder } from 'discord.js';
import playSubcommand from './play.js';
import nowplayingSubcommand from './nowplaying.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Commandes pour contrôler la radio')
    .setDMPermission(false)
    .addSubcommand(playSubcommand.builder)
    .addSubcommand(nowplayingSubcommand.builder),

  async execute (interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check admin permissions for stop command
    if (
      subcommand === 'stop'
      && !interaction.member.roles.cache.has(config.ADMIN_ROLE_ID)
    ) {
      return await interaction.reply({
        content: '❌ Cette commande est réservée aux administrateurs.',
        ephemeral: true
      });
    }

    switch (subcommand) {
    case 'play':
      return await playSubcommand.execute(interaction);
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
