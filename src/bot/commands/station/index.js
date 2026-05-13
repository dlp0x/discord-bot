import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import scheduleSubcommand from './schedule.js';
import statsSubcommand from './stats.js';
import speakerStatusSubcommand from './speaker-status.js';
import promoteSpeakerSubcommand from './promote-speaker.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('station')
    .setDescription('Commandes pour gérer la station et les stages')
    .setDMPermission(false)
    .addSubcommand(scheduleSubcommand.builder(new SlashCommandSubcommandBuilder()))
    .addSubcommand(statsSubcommand.builder(new SlashCommandSubcommandBuilder()))
    .addSubcommand(speakerStatusSubcommand.builder)
    .addSubcommand(promoteSpeakerSubcommand.builder),

  async execute (interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check admin permissions for promote-speaker command
    if (
      subcommand === 'promote-speaker'
      && !interaction.member.roles.cache.has(config.ADMIN_ROLE_ID)
    ) {
      return await interaction.reply({
        content: '❌ Cette commande est réservée aux administrateurs.',
        ephemeral: true
      });
    }

    switch (subcommand) {
    case 'schedule':
      return await scheduleSubcommand.execute(interaction);
    case 'stats':
      return await statsSubcommand.execute(interaction);
    case 'speaker-status':
      return await speakerStatusSubcommand.execute(interaction);
    case 'promote-speaker':
      return await promoteSpeakerSubcommand.execute(interaction);
    default:
      return await interaction.reply({
        content: '❌ Sous-commande inconnue.',
        ephemeral: true
      });
    }
  }
};
