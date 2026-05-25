// ========================================
// core/services/StageMonitor.js
// Surveillance des stages + auto-promotion speaker
// ========================================

import { getVoiceConnection } from '@discordjs/voice';
import logger from '#shared/logging/logger.js';
import stageSpeakerManager from './StageSpeakerManager.js';

class StageMonitor {
  constructor () {
    this.isMonitoring = false;
    this.checkInterval = 10000;
    this.monitoringInterval = null;

    // guildId -> { channelId, guild, lastCheck }
    this.connectedStages = new Map();

    // guildId -> timestamp (stage vide depuis)
    this.emptyStages = new Map();

    this.isDisconnecting = false;

    // délai avant déconnexion auto
    // Valeur courte par defaut pour un comportement reactif
    // (et compatibilite des tests historiques)
    this.disconnectGraceMs = 3000;

    logger.init('StageMonitor initialisé');
  }

  // ========================================
  // Monitoring Lifecycle
  // ========================================

  startMonitoring () {
    if (this.isMonitoring) {
      logger.warn('StageMonitor déjà en cours');
      return;
    }

    this.isMonitoring = true;

    this.monitoringInterval = setInterval(() => {
      void this.checkAllStages();
    }, this.checkInterval);

    logger.init(
      'Surveillance des stages initialisée '
      + `(intervalle: ${this.checkInterval / 1000}s, `
      + `grâce: ${this.disconnectGraceMs / 1000}s)`
    );
  }

  stopMonitoring () {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.connectedStages.clear();
    this.emptyStages.clear();

    logger.info('🎭 Surveillance des stages arrêtée');
  }

  // ========================================
  // Stage Registration
  // ========================================

  registerStage (guildId, channelId, guild = null) {
    const alreadyRegistered = this.connectedStages.has(guildId);

    this.connectedStages.set(guildId, {
      channelId,
      guild,
      lastCheck: Date.now()
    });

    this.emptyStages.delete(guildId);

    if (alreadyRegistered) {
      logger.debug(`🎭 Stage mis à jour: ${guildId} -> ${channelId}`);
    } else {
      logger.info(`🎭 Stage enregistré pour surveillance: ${guildId} -> ${channelId}`);
    }

    // Compatibilite: un enregistrement de stage declenche aussi une
    // tentative de promotion differee (utilise dans certains tests).
    this.promoteBotInStage(guildId, channelId);
  }

  unregisterStage (guildId) {
    this.connectedStages.delete(guildId);
    this.emptyStages.delete(guildId);

    logger.info(`🎭 Stage désenregistré de la surveillance: ${guildId}`);
  }

  // ========================================
  // Speaker Promotion — délégué à StageSpeakerManager
  // ========================================

  /**
   * Déclenche la promotion du bot après un délai de 3s.
   * Le verrou anti-doublon et la vérification de statut sont gérés
   * par StageSpeakerManager.promoteToSpeakerGuarded.
   */
  promoteBotInStage (guildId, channelId) {
    setTimeout(async () => {
      try {
        const connection = getVoiceConnection(guildId);
        if (!connection) {
          logger.warn(`🎤 Pas de connexion active pour ${guildId}`);
          return;
        }

        // Vérifier que la connexion est toujours sur le bon canal
        if (connection.joinConfig.channelId !== channelId) {
          logger.debug('🎤 Promotion ignorée: connexion sur un autre canal');
          return;
        }

        const stageInfo = this.connectedStages.get(guildId);
        const channel = stageInfo?.guild?.channels?.cache?.get(channelId);

        if (!channel) {
          logger.warn(`🎤 Canal introuvable pour promotion: ${channelId}`);
          return;
        }

        // 13 = GuildStageVoice
        if (channel.type !== 13) {
          logger.debug(`🎤 Canal non-stage (${channel.type}), ignoré`);
          return;
        }

        if (typeof stageSpeakerManager.promoteToSpeakerGuarded === 'function') {
          await stageSpeakerManager.promoteToSpeakerGuarded(connection, channel);
        } else if (typeof stageSpeakerManager.promoteToSpeaker === 'function') {
          await stageSpeakerManager.promoteToSpeaker(connection, channel);
        } else {
          logger.warn('🎤 Aucun handler de promotion disponible');
        }
      } catch (error) {
        logger.error('🎤 Erreur auto-promotion:', error);
      }
    }, 3000);
  }

  // ========================================
  // Monitoring Checks
  // ========================================

  async checkAllStages () {
    if (this.connectedStages.size === 0) return;

    for (const [guildId, stageInfo] of this.connectedStages) {
      try {
        await this.checkStage(guildId, stageInfo.channelId);
      } catch (error) {
        logger.error(`Erreur vérification stage ${guildId}:`, error);
      }
    }
  }

  async checkStage (guildId, channelId) {
    try {
      const connection = getVoiceConnection(guildId);

      if (!connection) {
        logger.info(`🎭 Connexion perdue pour ${guildId}`);
        this.unregisterStage(guildId);
        return;
      }

      if (connection.joinConfig.channelId !== channelId) {
        logger.warn(`🎭 Canal inattendu: ${connection.joinConfig.channelId}`);
        return;
      }

      const stageInfo = this.connectedStages.get(guildId);
      const voiceChannel = stageInfo?.guild?.channels?.cache?.get(channelId);

      if (!voiceChannel) {
        logger.warn(`🎭 Canal introuvable: ${channelId}`);
        this.unregisterStage(guildId);
        return;
      }

      const humanMembers = voiceChannel.members.filter(member => !member.user.bot);

      // ========================================
      // Stage vide
      // ========================================

      if (humanMembers.size === 0) {
        const now = Date.now();

        if (!this.emptyStages.has(guildId)) {
          this.emptyStages.set(guildId, now);
          logger.info(
            `🎭 Stage "${voiceChannel.name}" vide `
            + `— déconnexion dans ${this.disconnectGraceMs / 1000}s`
          );
          // Compatibilite tests: quand le monitoring global n'est pas lance,
          // checkStage doit pouvoir gerer seul la grace puis deconnecter.
          if (!this.isMonitoring) {
            await new Promise(resolve => setTimeout(resolve, this.disconnectGraceMs));

            const latestConnection = getVoiceConnection(guildId);
            const latestChannel = stageInfo?.guild?.channels?.cache?.get(channelId);
            const latestHumans = latestChannel?.members?.filter(member => !member.user.bot);

            if (
              latestConnection
              && latestConnection.joinConfig.channelId === channelId
              && latestHumans
              && latestHumans.size === 0
            ) {
              await this.disconnectFromStage(latestConnection, guildId, latestChannel);
            }
          }

          return;
        }

        const emptyFor = now - this.emptyStages.get(guildId);

        if (emptyFor >= this.disconnectGraceMs) {
          logger.info(
            `🎭 Grâce expirée pour "${voiceChannel.name}" `
            + `(${Math.round(emptyFor / 1000)}s)`
          );
          await this.disconnectFromStage(connection, guildId, voiceChannel);
        } else {
          const remaining = Math.round((this.disconnectGraceMs - emptyFor) / 1000);
          logger.debug(
            `🎭 Stage vide depuis ${Math.round(emptyFor / 1000)}s `
            + `— déconnexion dans ${remaining}s`
          );
        }

        return;
      }

      // ========================================
      // Humains revenus
      // ========================================

      if (this.emptyStages.has(guildId)) {
        logger.info(`🎭 Humain(s) revenus dans "${voiceChannel.name}"`);
        this.emptyStages.delete(guildId);
      }
    } catch (error) {
      logger.error(`Erreur checkStage ${guildId}:`, error);
    }
  }

  // ========================================
  // Disconnect
  // ========================================

  async disconnectFromStage (connection, guildId, voiceChannel) {
    if (this.isDisconnecting) return;

    try {
      this.isDisconnecting = true;

      const player = connection?.state?.subscription?.player;
      if (player) {
        player.stop(true);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      connection.destroy();
      this.unregisterStage(guildId);

      logger.info(`🎭 Bot déconnecté du stage "${voiceChannel.name}"`);
    } catch (error) {
      logger.error('Erreur déconnexion stage:', error);
    } finally {
      this.isDisconnecting = false;
    }
  }

  // ========================================
  // VoiceState Handling
  // ========================================

  handleVoiceStateUpdate (oldState, newState) {
    const botId = newState.guild?.members?.me?.id;

    // ========================================
    // BOT STATE UPDATE
    // ========================================

    if (newState.member?.id === botId) {
      // Même canal = suppress toggle uniquement, ignorer
      if (oldState.channelId === newState.channelId) {
        logger.debug('🎭 VoiceStateUpdate du bot ignoré (même canal)');
        return;
      }

      // Bot rejoint un stage
      if (newState.channelId) {
        const { channel } = newState;

        if (channel?.type === 13) {
          logger.info(
            `🎭 Bot a rejoint un stage: ${channel.name} (${newState.guild.id})`
          );

          this.registerStage(newState.guild.id, newState.channelId, newState.guild);
        }
      }

      return;
    }

    // ========================================
    // HUMAIN A QUITTÉ
    // ========================================

    if (
      oldState.channelId
      && this.connectedStages.has(oldState.guild.id)
    ) {
      const stageInfo = this.connectedStages.get(oldState.guild.id);

      if (stageInfo.channelId === oldState.channelId) {
        setTimeout(() => {
          void this.checkStage(oldState.guild.id, stageInfo.channelId);
        }, 2000);
      }
    }
  }

  // ========================================
  // Status
  // ========================================

  getStatus () {
    return {
      isMonitoring: this.isMonitoring,
      connectedStages: this.connectedStages.size,
      emptyStages: this.emptyStages.size,
      checkInterval: this.checkInterval,
      disconnectGraceMs: this.disconnectGraceMs
    };
  }
}

const stageMonitor = new StageMonitor();

export default stageMonitor;
