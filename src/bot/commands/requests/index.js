import { SlashCommandBuilder } from 'discord.js';
import addSubcommand from './requests.js';
import searchSubcommand from './requests-search.js';
import config from '../../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('requests')
    .setDescription('Gerer les requests de morceaux')
    .setDMPermission(false)
    .addSubcommand(addSubcommand.builder)
    .addSubcommand(searchSubcommand.builder),

  async execute (interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (!config.reqRoleId || !interaction.member.roles.cache.has(config.reqRoleId)) {
      return await interaction.reply({
        content: 'Tu n\'as pas l\'autorisation d\'utiliser cette commande.',
        ephemeral: true
      });
    }

    switch (subcommand) {
    case 'add':
      return await addSubcommand.execute(interaction);
    case 'search':
      return await searchSubcommand.execute(interaction);
    default:
      return await interaction.reply({
        content: 'Sous-commande inconnue.',
        ephemeral: true
      });
    }
  }
};
