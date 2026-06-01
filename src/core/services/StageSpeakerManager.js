// ========================================
// core/services/StageSpeakerManager.js - Gestion de l'auto-promotion en speaker
// ========================================

import { PermissionFlagsBits } from 'discord.js';
import logger from '../../shared/logging/logger.js';

class StageSpeakerManager {
  #promotingGuilds = new Set();

  constructor () {
    // 🔥 AJOUT DE MuteMembers : Indispensable pour s'auto-promouvoir sans intervention humaine
    this.requiredPermissions = [
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.RequestToSpeak,
      PermissionFlagsBits.MuteMembers 
    ];

    logger.init('StageSpeakerManager initialisé');
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

      // Si le bot est Administrateur, il a toutes les permissions d'office
      if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
        return { hasPermissions: true, missingPermissions: [] };
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
      logger.error('Erreur lors de la vérification des permissions:', error.message || error);
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
      // Sur Discord, être supprimé (suppress = true) signifie être dans le public.
      const isSuppressed = botMember.voice.suppress ?? true;

      return {
        isConnected,
        isSpeaker: isConnected && !isSuppressed,
        isSuppressed,
        channelId: botMember.voice.channelId
      };
    } catch (error) {
      logger.error('Erreur lors de la vérification du statut du stage:', error.message || error);
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

      // 🔥 AMÉLIORATION : Forcer un fetch du membre vocal pour obtenir l'état réseau le plus récent
      const guild = channel.guild;
      const botMember = await guild.members.fetch(guild.client.user.id).catch(() => guild.members.me);

      if (!botMember?.voice?.channelId) {
        // Optionnel : Accorder un micro-délai de rattrapage si Discord synchronise l'état
        await new Promise(resolve => setTimeout(resolve, 250));
        if (!botMember?.voice?.channelId) {
          throw new Error('Le bot n\'est pas encore détecté comme connecté au flux vocal par l\'API Discord.js');
        }
      }

      // Exécuter la demande de parole (devient Speaker)
      await botMember.voice.setSuppressed(false);

      return { success: true, message: 'Bot promu en speaker avec succès' };
    } catch (error) {
      let errorType = 'UNKNOWN_ERROR';
      let userMessage = error.message || 'Erreur inconnue lors de la promotion en speaker';

      if (
        error.code === 50013
        || error.code === 'DiscordAPIError[50013]'
        || (error.name === 'DiscordAPIError' && error.message.toLowerCase().includes('permission'))
      ) {
        errorType = 'INSUFFICIENT_PERMISSIONS';
        userMessage = 'Le bot n\'est pas Modérateur du stage (la permission "Gérer les demandes de parole / Mute Members" est manquante)';
      } else if (error.code === 50001) {
        errorType = 'MISSING_ACCESS';
        userMessage = 'Accès manquant au canal vocal';
      }

      // 🔥 CORRECTION LOGS : Extraction de error.message pour éviter d'afficher un objet vide {}
      logger.error('Erreur lors de la promotion en speaker:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });

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
   */
  async promoteToSpeakerGuarded (connection, channel) {
    const guildId = channel.guild.id;

    if (this.#promotingGuilds.has(guildId)) {
      logger.debug(`🎤 Promotion déjà en cours pour ${guildId}, ignorée`);
      return { success: false, message: 'ALREADY_PROMOTING' };
    }

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
          `🎤 Échec auto-promotion dans ${channel.name}: ${result.message}${
            missingPerms.length ? ` (${missingPerms.join(', ')})` : ''}`
        );
      }

      return result;
    } finally {
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
      [PermissionFlagsBits.RequestToSpeak]: 'Demander à parler',
      [PermissionFlagsBits.MuteMembers]: 'Gérer les demandes de parole (Mute Members)'
    };

    return missingPermissions.map(
      permission => permissionNames[permission] || `Permission inconnue (${permission})`
    );
  }
}

const stageSpeakerManager = new StageSpeakerManager();
export default stageSpeakerManager;
