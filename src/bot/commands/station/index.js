import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import statsSubcommand from './stats.js';


export default {
  data: new SlashCommandBuilder()
    .setName('station')
    .setDescription('Commandes pour gérer la station et les stages')
    .setDMPermission(false)
    .addSubcommand(statsSubcommand.builder(new SlashCommandSubcommandBuilder())),

  async execute (interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
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
