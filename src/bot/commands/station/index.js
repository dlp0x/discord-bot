import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import scheduleSubcommand from './schedule.js';
import statsSubcommand from './stats.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('station')
    .setDescription('Commandes pour gérer la station et les stages')
    .setDMPermission(false)
    .addSubcommand(scheduleSubcommand.builder(new SlashCommandSubcommandBuilder()))
    .addSubcommand(statsSubcommand.builder(new SlashCommandSubcommandBuilder())),

  async execute (interaction) {
    const subcommand = interaction.options.getSubcommand();

    

    switch (subcommand) {
    case 'schedule':
      return await scheduleSubcommand.execute(interaction);
    case 'stats':
      return await statsSubcommand.execute(interaction);
    default:
      return await interaction.reply({
        content: '❌ Sous-commande inconnue.',
        ephemeral: true
      });
    }
  }
};
