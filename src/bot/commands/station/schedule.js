import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import logger from '#shared/logging/logger.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('schedule')
      .setDescription('Affiche l\'horaire des programmes'),
      async execute(interaction) {
        try {
          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📅 Choose a language')
            .setDescription(
              'Clique sur un des boutons pour afficher l\'horaire.'
            );
      
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('schedule_fr')
              .setLabel('Français')
              .setStyle(ButtonStyle.Primary),
      
            new ButtonBuilder()
              .setCustomId('schedule_en')
              .setLabel('English')
              .setStyle(ButtonStyle.Secondary)
          );
      
          await interaction.reply({
            embeds: [embed],
            components: [row]
          });
        } catch (error) {
          logger.error('Erreur lecture horaire :', error);
      
          await interaction.reply({
            content: '❌ Impossible de lire l\'horaire.',
            flags: MessageFlags.Ephemeral
          });
        }
      }
    }