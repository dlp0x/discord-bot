// ========================================
// bot/commands/station/stream-config.js - Diagnostic de la configuration du stream
// ========================================

import { ChannelType, EmbedBuilder } from 'discord.js';
import logger from '../../logger.js';
import config from '../../config.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('stream-config')
      .setDescription('Vérifie la configuration du streaming'),

  async execute (interaction) {
    try {
      const { voice } = interaction.member;
      const channel = voice && voice.channel;

      if (!channel) {
        return {
          success: false,
          message: '❌ Tu dois être dans un salon vocal ou Stage Channel.',
          ephemeral: true
        };
      }

      if (channel.type !== ChannelType.GuildStageVoice) {
        return {
          success: false,
          message: '❌ Cette commande ne fonctionne que dans un Stage Channel.',
          ephemeral: true
        };
      }

      // Vérifier la configuration
      const streamUrl = config.STREAM_URL;
      const jsonUrl = config.JSON_URL;
      const hasStreamUrl = !!streamUrl;
      const hasJsonUrl = !!jsonUrl;

      // Créer un embed de diagnostic
      const embed = new EmbedBuilder()
        .setTitle('🔧 Configuration du Streaming')
        .setColor(hasStreamUrl ? 0x00ff00 : 0xff0000)
        .setTimestamp()
        .addFields(
          {
            name: '🔗 URL du Stream',
            value: hasStreamUrl ? `✅ Configurée\n\`${streamUrl}\`` : '❌ Non configurée',
            inline: false
          },
          {
            name: '📊 URL JSON (métadonnées)',
            value: hasJsonUrl ? `✅ Configurée\n\`${jsonUrl}\`` : '⚠️ Non configurée',
            inline: false
          },
          {
            name: '🎭 Canal Stage',
            value: `✅ ${channel.name} (${channel.id})`,
            inline: true
          },
          {
            name: '🏠 Serveur',
            value: `✅ ${interaction.guild.name}`,
            inline: true
          }
        );

      // Ajouter des conseils
      let advice = '';
      if (!hasStreamUrl) {
        advice += '• Configurez la variable d\'environnement `STREAM_URL`\n';
      }
      if (!hasJsonUrl) {
        advice += '• Configurez la variable d\'environnement `JSON_URL` pour les métadonnées\n';
      }

      if (advice) {
        embed.addFields({
          name: '💡 Conseils',
          value: advice.trim(),
          inline: false
        });
      }

      // Tester l'URL du stream si elle existe
      if (hasStreamUrl) {
        try {
          const response = await fetch(streamUrl, {
            method: 'HEAD',
            timeout: 5000
          });
          const isAccessible = response.ok;
          embed.addFields({
            name: '🌐 Accessibilité du Stream',
            value: isAccessible ? '✅ Accessible' : `❌ Inaccessible (${response.status})`,
            inline: true
          });
        } catch (fetchError) {
          embed.addFields({
            name: '🌐 Accessibilité du Stream',
            value: `❌ Erreur: ${fetchError.message}`,
            inline: true
          });
        }
      }

      return {
        success: true,
        message: { embeds: [embed] },
        ephemeral: true
      };
    } catch (error) {
      logger.error('❌ Erreur dans stream-config:', error);
      return {
        success: false,
        message: '❌ Une erreur est survenue lors de la vérification de la configuration.',
        ephemeral: true
      };
    }
  }
};
