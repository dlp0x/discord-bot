import { SlashCommandBuilder } from 'discord.js';
import streamConfigSubcommand from './streamconfig.js';
import cacheclearSubcommand from './cacheclear.js';
import { buildConfigGroup, handleConfigGroup } from './config.js';
import { buildReloadGroup, handleReloadGroup } from './reload.js';
import { buildDebugGroup, handleDebugGroup } from './debug.js';

export default {
  meta: {
    category: 'admin',
    requiresAdmin: true,
    deferReply: false,
    ephemeral: true,
    cooldown: 2
  },

  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Commandes d’administration du bot')
    .setDMPermission(false)
    // Nouveau format demandé
    .addSubcommandGroup(buildConfigGroup)
    .addSubcommandGroup(buildReloadGroup)
    .addSubcommandGroup(buildDebugGroup)
    // Legacy conservé pour migration douce
    .addSubcommand(streamConfigSubcommand.builder)
    .addSubcommand(cacheclearSubcommand.builder),

  async execute (interaction, context) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (group === 'config') {
      return await handleConfigGroup(subcommand, interaction, context);
    }
    if (group === 'reload') {
      return await handleReloadGroup(subcommand, interaction, context);
    }
    if (group === 'debug') {
      return await handleDebugGroup(subcommand, interaction, context);
    }

    // Legacy routes
    switch (subcommand) {
    case 'stream-config':
      return await streamConfigSubcommand.execute(interaction, context);
    case 'cache-clear':
      return await cacheclearSubcommand.execute(interaction, context);
    default:
      return {
        success: false,
        message: '❌ Sous-commande inconnue.',
        ephemeral: true
      };
    }
  }
};
