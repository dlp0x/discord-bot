import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import logger from '../logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Renvoie la latence du bot'),

  async execute (interaction) {
    try {
      const sent = await interaction.reply({
        content: 'Ping...',
        fetchReply: true
      });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = Math.round(interaction.client.ws.ping);

      return await interaction.editReply(
        `🏓 Pong !\n🕒 Latence bot: **${latency}ms**\n📡 Latence API: **${apiLatency}ms**`
      );
    } catch (error) {
      logger.error('Erreur lors de la commande ping:', error);
      return await interaction.reply({
        content: '❌ Erreur lors de la vérification de la latence.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

