// ========================================
// core/services/StageSpeakerManager.js - Gestion de l'auto-promotion en speaker
// ========================================

import { PermissionFlagsBits } from 'discord.js';
import logger from '../../bot/logger.js';

class StageSpeakerManager {
  #promotingGuilds = new Set();

  constructor () {
    this.requiredPermissions = [
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.RequestToSpeak
    ];

    logger.info('StageSpeakerManager initialisé');
  }

  /**
   * Vérifier si le bot a les permissions nécessaires pour s'auto-promouvoir
   */
  checkBotPermissions (guild, channel) {
    try {
      const botMember = guild.members.me;
      if (!botMember) {
        logger.error('Bot member introuvable dans le guild');
        return { hasPermissions: false, missingPermissions: this.requiredPermissions };
      }

      const channelPermissions = channel.permissionsFor(botMember);
      if (!channelPermissions) {
        logger.error('Impossible de récupérer les permissions du canal');
        return { hasPermissions: false, missingPermissions: this.requiredPermissions };
      }

      const missingPermissions = this.requiredPermissions.filter(
        permission => !channelPermissions.has(permission)
      );

      return {
        hasPermissions: missingPermissions.length === 0,
        missingPermissions
      };
    } catch (error) {
      logger.error('Erreur lors de la vérification des permissions:', error);
      return { hasPermissions: false, missingPermissions: this.requiredPermissions };
    }
  }

  /**
   * Vérifier le statut actuel du bot dans le stage
   */
  getBotStageStatus (guild, channel) {
    try {
      const botMember = guild.members.me;
      if (!botMember?.voice) {
        return { isConnected: false, isSpeaker: false, isSuppressed: true, channelId: null };
      }

      const isConnected = botMember.voice.channelId === channel.id;
      const isSuppressed = botMember.voice.suppress;

      return {
        isConnected,
        isSpeaker: isConnected && !isSuppressed,
        isSuppressed,
        channelId: botMember.voice.channelId
      };
    } catch (error) {
      logger.error('Erreur lors de la vérification du statut du stage:', error);
      return { isConnected: false, isSpeaker: false, isSuppressed: true, channelId: null };
    }
  }

  /**
   * Tenter de promouvoir le bot en speaker
   */
  async promoteToSpeaker (connection, channel) {
    try {
      if (!connection || !channel) {
        throw new Error('Connexion ou canal manquant');
      }

      const { hasPermissions, missingPermissions } = this.checkBotPermissions(
        channel.guild,
        channel
      );

      if (!hasPermissions) {
        const missingNames = this.formatMissingPermissions(missingPermissions).join(', ');
        logger.warn(`Permissions manquantes pour l'auto-promotion: ${missingNames}`);
        return {
          success: false,
          error: 'INSUFFICIENT_PERMISSIONS',
          message: `Permissions manquantes: ${missingNames}`,
          missingPermissions
        };
      }

      const botMember = channel.guild.members.me;
      if (!botMember?.voice?.channelId) {
        throw new Error('Bot not connected to voice');
      }

      await botMember.voice.setSuppressed(false);

      return { success: true, message: 'Bot promu en speaker avec succès' };
    } catch (error) {
      let errorType = 'UNKNOWN_ERROR';
      let userMessage = 'Erreur inconnue lors de la promotion en speaker';

      if (
        error.code === 50013
        || error.code === 'DiscordAPIError[50013]'
        || (error.name === 'DiscordAPIError' && error.message.includes('permissions'))
      ) {
        errorType = 'INSUFFICIENT_PERMISSIONS';
        userMessage = 'Le bot n\'est pas Stage Moderator (permission "Gérer le canal" manquante dans le stage)';
      } else if (error.code === 50001) {
        errorType = 'MISSING_ACCESS';
        userMessage = 'Accès manquant au canal vocal';
      } else if (error.message.includes('suppressed')) {
        errorType = 'SUPPRESSION_ERROR';
        userMessage = 'Erreur lors de la modification du statut de suppression';
      }

      logger.error('Erreur lors de la promotion en speaker:', error);

      return {
        success: false,
        error: errorType,
        message: userMessage,
        originalError: error.message
      };
    }
  }

  /**
   * Promouvoir le bot en speaker avec verrou anti-doublon.
   * Remplace l'ancien système promotingStages/pendingPromotions de StageMonitor.
   */
  async promoteToSpeakerGuarded (connection, channel) {
    const guildId = channel.guild.id;

    if (this.#promotingGuilds.has(guildId)) {
      logger.debug(`🎤 Promotion déjà en cours pour ${guildId}, ignorée`);
      return { success: false, message: 'ALREADY_PROMOTING' };
    }

    // Vérifier avant d'acquérir le verrou
    const status = this.getBotStageStatus(channel.guild, channel);
    if (status.isSpeaker) {
      logger.debug(`🎤 Bot déjà speaker dans ${channel.name}`);
      return { success: true, message: 'ALREADY_SPEAKER' };
    }

    this.#promotingGuilds.add(guildId);

    try {
      logger.info(`🎤 Tentative auto-promotion dans ${channel.name}`);
      const result = await this.promoteToSpeaker(connection, channel);

      if (result.success) {
        logger.info(`🎤 Bot auto-promu en speaker dans ${channel.name}`);
      } else {
        const missingPerms = this.formatMissingPermissions(result.missingPermissions || []);
        logger.warn(
          `🎤 Échec auto-promotion dans ${channel.name}: ${result.message}`
          + (missingPerms.length ? ` (${missingPerms.join(', ')})` : '')
        );
      }

      return result;
    } finally {
      // Délai anti-rebond VoiceStateUpdate
      setTimeout(() => {
        this.#promotingGuilds.delete(guildId);
        logger.debug(`🎤 Verrou de promotion libéré pour ${guildId}`);
      }, 5000);
    }
  }

  /**
   * Obtenir des informations détaillées sur les permissions et le statut
   */
  getDetailedStatus (guild, channel, _connection) {
    const permissions = this.checkBotPermissions(guild, channel);
    const stageStatus = this.getBotStageStatus(guild, channel);

    return {
      permissions,
      stageStatus,
      canAutoPromote: permissions.hasPermissions && stageStatus.isConnected,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Formater les permissions manquantes pour l'affichage
   */
  formatMissingPermissions (missingPermissions) {
    const permissionNames = {
      [PermissionFlagsBits.Connect]: 'Se connecter',
      [PermissionFlagsBits.Speak]: 'Parler',
      [PermissionFlagsBits.RequestToSpeak]: 'Demander à parler'
    };

    return missingPermissions.map(
      permission => permissionNames[permission] || `Permission inconnue (${permission})`
    );
  }
}

const stageSpeakerManager = new StageSpeakerManager();

export default stageSpeakerManager;