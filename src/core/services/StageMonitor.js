// ========================================
// core/services/StageMonitor.js
// Surveillance des stages + auto-promotion speaker
// ========================================

import { getVoiceConnection } from '@discordjs/voice';
import logger from '../../bot/logger.js';
import stageSpeakerManager from './StageSpeakerManager.js';

class StageMonitor {
  constructor () {
    this.isMonitoring = false;
    this.checkInterval = 10000;
    this.monitoringInterval = null;

    // guildId -> { channelId, guild, lastCheck }
    this.connectedStages = new Map();

    // guildId -> timestamp
    this.emptyStages = new Map();

    // guildIds actuellement en promotion
    this.promotingStages = new Set();

    // guildId -> timeout
    this.pendingPromotions = new Map();

    this.isDisconnecting = false;

    // délai avant déconnexion auto
    this.disconnectGraceMs = 10000;

    logger.info('StageMonitor initialisé');
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

    logger.info(
      `🎭 Surveillance des stages démarrée `
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

    for (const timeout of this.pendingPromotions.values()) {
      clearTimeout(timeout);
    }

    this.connectedStages.clear();
    this.emptyStages.clear();
    this.promotingStages.clear();
    this.pendingPromotions.clear();

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
      logger.debug(
        `🎭 Stage mis à jour: ${guildId} -> ${channelId}`
      );
    } else {
      logger.info(
        `🎭 Stage enregistré pour surveillance: `
        + `${guildId} -> ${channelId}`
      );
    }
  }

  unregisterStage (guildId) {
    this.connectedStages.delete(guildId);
    this.emptyStages.delete(guildId);
    this.promotingStages.delete(guildId);

    const pendingTimeout = this.pendingPromotions.get(guildId);

    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingPromotions.delete(guildId);
    }

    logger.info(
      `🎭 Stage désenregistré de la surveillance: ${guildId}`
    );
  }

  // ========================================
  // Speaker Promotion
  // ========================================

  async promoteBotInStage (guildId, channelId) {
    // anti-double promotion
    if (this.promotingStages.has(guildId)) {
      logger.debug(
        `🎤 Promotion déjà en cours pour ${guildId}, ignorée`
      );
      return;
    }

    // lock IMMÉDIAT
    this.promotingStages.add(guildId);

    const timeout = setTimeout(async () => {
      try {
        const connection = getVoiceConnection(guildId);

        if (!connection) {
          logger.warn(
            `🎤 Pas de connexion active pour ${guildId}`
          );
          return;
        }

        const stageInfo = this.connectedStages.get(guildId);

        const channel =
          stageInfo?.guild?.channels?.cache?.get(channelId);

        if (!channel) {
          logger.warn(
            `🎤 Canal introuvable pour promotion: ${channelId}`
          );
          return;
        }

        // 13 = GuildStageVoice
        if (channel.type !== 13) {
          logger.debug(
            `🎤 Canal non-stage (${channel.type}), ignoré`
          );
          return;
        }

        // sécurité : toujours connecté au bon stage ?
        const activeConnection = getVoiceConnection(guildId);

        if (
          !activeConnection
          || activeConnection.joinConfig.channelId !== channelId
        ) {
          logger.debug(
            `🎤 Promotion ignorée: connexion inactive`
          );
          return;
        }

        const botMember = channel.guild.members.me;

        // déjà speaker
        if (
          botMember?.voice?.channelId === channelId
          && botMember.voice.suppress === false
        ) {
          logger.debug(
            `🎤 Bot déjà speaker dans ${channel.name}`
          );
          return;
        }

        logger.info(
          `🎤 Tentative auto-promotion dans ${channel.name}`
        );

        const result =
          await stageSpeakerManager.promoteToSpeaker(
            activeConnection,
            channel
          );

        if (result.success) {
          logger.info(
            `🎤 Bot auto-promu en speaker dans ${channel.name}`
          );
        } else {
          logger.warn(
            `🎤 Échec auto-promotion dans `
            + `${channel.name}: ${result.message}`
          );
        }
      } catch (error) {
        logger.error(
          '🎤 Erreur auto-promotion:',
          error
        );
      } finally {
        this.pendingPromotions.delete(guildId);

        // délai anti-rebond VoiceStateUpdate
        setTimeout(() => {
          this.promotingStages.delete(guildId);

          logger.debug(
            `🎤 Verrou de promotion libéré pour ${guildId}`
          );
        }, 5000);
      }
    }, 3000);

    this.pendingPromotions.set(guildId, timeout);
  }

  // ========================================
  // Monitoring Checks
  // ========================================

  async checkAllStages () {
    if (this.connectedStages.size === 0) return;

    for (const [guildId, stageInfo] of this.connectedStages) {
      try {
        await this.checkStage(
          guildId,
          stageInfo.channelId
        );
      } catch (error) {
        logger.error(
          `Erreur vérification stage ${guildId}:`,
          error
        );
      }
    }
  }

  async checkStage (guildId, channelId) {
    try {
      const connection = getVoiceConnection(guildId);

      if (!connection) {
        logger.info(
          `🎭 Connexion perdue pour ${guildId}`
        );

        this.unregisterStage(guildId);
        return;
      }

      if (connection.joinConfig.channelId !== channelId) {
        logger.warn(
          `🎭 Canal inattendu: `
          + `${connection.joinConfig.channelId}`
        );

        return;
      }

      const stageInfo = this.connectedStages.get(guildId);

      const voiceChannel =
        stageInfo?.guild?.channels?.cache?.get(channelId);

      if (!voiceChannel) {
        logger.warn(
          `🎭 Canal introuvable: ${channelId}`
        );

        this.unregisterStage(guildId);
        return;
      }

      const humanMembers =
        voiceChannel.members.filter(
          member => !member.user.bot
        );

      // ========================================
      // Stage vide
      // ========================================

      if (humanMembers.size === 0) {
        const now = Date.now();

        if (!this.emptyStages.has(guildId)) {
          this.emptyStages.set(guildId, now);

          logger.info(
            `🎭 Stage "${voiceChannel.name}" vide `
            + `— déconnexion dans `
            + `${this.disconnectGraceMs / 1000}s`
          );

          return;
        }

        const emptyFor =
          now - this.emptyStages.get(guildId);

        if (emptyFor >= this.disconnectGraceMs) {
          logger.info(
            `🎭 Grâce expirée pour `
            + `"${voiceChannel.name}" `
            + `(${Math.round(emptyFor / 1000)}s)`
          );

          await this.disconnectFromStage(
            connection,
            guildId,
            voiceChannel
          );
        } else {
          const remaining = Math.round(
            (this.disconnectGraceMs - emptyFor) / 1000
          );

          logger.debug(
            `🎭 Stage vide depuis `
            + `${Math.round(emptyFor / 1000)}s `
            + `— déconnexion dans ${remaining}s`
          );
        }

        return;
      }

      // ========================================
      // Humains revenus
      // ========================================

      if (this.emptyStages.has(guildId)) {
        logger.info(
          `🎭 Humain(s) revenus dans `
          + `"${voiceChannel.name}"`
        );

        this.emptyStages.delete(guildId);
      }
    } catch (error) {
      logger.error(
        `Erreur checkStage ${guildId}:`,
        error
      );
    }
  }

  // ========================================
  // Disconnect
  // ========================================

  async disconnectFromStage (
    connection,
    guildId,
    voiceChannel
  ) {
    if (this.isDisconnecting) return;

    try {
      this.isDisconnecting = true;

      const player =
        connection?.state?.subscription?.player;

      if (player) {
        player.stop(true);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      connection.destroy();

      this.unregisterStage(guildId);

      logger.info(
        `🎭 Bot déconnecté du stage `
        + `"${voiceChannel.name}"`
      );
    } catch (error) {
      logger.error(
        'Erreur déconnexion stage:',
        error
      );
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
      // même canal = suppress toggle
      if (oldState.channelId === newState.channelId) {
        logger.debug(
          '🎭 VoiceStateUpdate du bot ignoré '
          + '(même canal)'
        );

        return;
      }

      // bot rejoint stage
      if (newState.channelId) {
        const channel = newState.channel;

        if (channel?.type === 13) {
          logger.info(
            `🎭 Bot a rejoint un stage: `
            + `${channel.name} `
            + `(${newState.guild.id})`
          );

          this.registerStage(
            newState.guild.id,
            newState.channelId,
            newState.guild
          );

          // UNIQUE SOURCE DE PROMOTION
          void this.promoteBotInStage(
            newState.guild.id,
            newState.channelId
          );
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
      const stageInfo =
        this.connectedStages.get(oldState.guild.id);

      if (stageInfo.channelId === oldState.channelId) {
        setTimeout(() => {
          void this.checkStage(
            oldState.guild.id,
            stageInfo.channelId
          );
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
      pendingPromotions: this.pendingPromotions.size,
      promotingStages: this.promotingStages.size,
      checkInterval: this.checkInterval,
      disconnectGraceMs: this.disconnectGraceMs
    };
  }
}

const stageMonitor = new StageMonitor();

export default stageMonitor;
