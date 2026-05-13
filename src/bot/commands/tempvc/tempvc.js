import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { sendTempVcPanel } from '../../services/tempVcService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('voicechanneladmin')
    .setDescription('Ouvrir le panel de gestion de ton salon temporaire')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),

  async execute (interaction) {
    return sendTempVcPanel(interaction);
  }
};