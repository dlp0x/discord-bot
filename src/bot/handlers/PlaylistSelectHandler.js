import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import logger from '#shared/logging/logger.js';
import monitor from '../../core/monitor.js';

export default async function handlePlaylistSelect (interaction) {
  try {
    const [selectedPlaylist] = interaction.values;
    const userId = interaction.user.id;

    logger.info(
      `Playlist sélectionnée par ${interaction.user.tag}: ${selectedPlaylist}`
    );

    // Créer l'embed avec les informations de la playlist
    const embed = new EmbedBuilder()
      .setColor('#FF6B6B')
      .setTitle('🎵 Playlist Sélectionnée')
      .setDescription(`**${selectedPlaylist}**`)
      .addFields(
        { name: '👤 Utilisateur', value: `<@${userId}>`, inline: true },
        {
          name: '📅 Date',
          value: new Date().toLocaleString('fr-FR'),
          inline: true
        }
      )
      .setFooter({ text: 'soundSHINE Radio' })
      .setTimestamp();

    // Créer les boutons d'action
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`play_${selectedPlaylist}`)
        .setLabel('▶️ Lancer')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`stop_${selectedPlaylist}`)
        .setLabel('⏹️ Arrêter')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`info_${selectedPlaylist}`)
        .setLabel('ℹ️ Info')
        .setStyle(ButtonStyle.Primary)
    );

    // Mettre à jour l'interaction
    await interaction.update({
      embeds: [embed],
      components: [actionRow]
    });

    logger.success(
      `Interface de playlist mise à jour pour ${interaction.user.tag}`
    );
  } catch (error) {
    monitor.handleCommandError(error, interaction);
    logger.error('Erreur dans handlePlaylistSelect:', error);
    throw error;
  }
}
