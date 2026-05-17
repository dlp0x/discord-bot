import { ChannelType } from 'discord.js';
import logger from '#shared/logging/logger.js';

export default {
  builder: (subcommand) =>
    subcommand
      .setName('play')
      .setDescription('Lance le stream dans un Stage Channel'),


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

      // Retourner un message spécial pour indiquer qu'il faut utiliser deferReply
      return {
        success: true,
        message: 'PLAY_COMMAND',
        deferReply: true
      };
    } catch (error) {
      logger.error('❌ Erreur exécution /play :', error);
      return {
        success: false,
        message: '❌ Une erreur est survenue pendant la tentative de lecture.',
        ephemeral: true
      };
    }
  }
};

