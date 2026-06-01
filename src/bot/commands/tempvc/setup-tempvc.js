import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { setupTempVc } from '../../services/tempVcService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vc-setup')
    .setDescription('Configure le salon Join-to-Create pour les Temporary VC')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('join_channel')
        .setDescription('Salon vocal source (Join-to-Create)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice))
    .addChannelOption((option) =>
      option
        .setName('category')
        .setDescription('Catégorie de création des salons temporaires')
        .addChannelTypes(ChannelType.GuildCategory))
    .addBooleanOption((option) =>
      option
        .setName('auto_play_radio')
        .setDescription('Active l\'auto-play radio pour chaque salon temporaire')),

  async execute (interaction) {
    return setupTempVc(interaction);
  }
};
