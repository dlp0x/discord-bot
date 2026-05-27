import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import logger from '#shared/logging/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Renvoie la latence du bot'),

  async execute(interaction) {
    try {
      await interaction.reply({
        content: 'Ping...'
      });

      const sent = await interaction.fetchReply();

      const latency =
        sent.createdTimestamp - interaction.createdTimestamp;

      const apiLatency =
        Math.round(interaction.client.ws.ping);

      return await interaction.editReply(
        `🏓 Pong !\n🕒 Latence bot: **${latency}ms**\n📡 Latence API: **${apiLatency}ms**`
      );

    } catch (error) {
      logger.error('Erreur lors de la commande ping:', error);

      if (interaction.replied || interaction.deferred) {
        return await interaction.followUp({
          content: '❌ Erreur lors de la vérification de la latence.',
          flags: MessageFlags.Ephemeral
        });
      }

      return await interaction.reply({
        content: '❌ Erreur lors de la vérification de la latence.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}; 