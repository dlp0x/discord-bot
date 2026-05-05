// ========================================
// core/services/StageMonitor.js - Surveillance des stages pour déconnexion automatique + auto-promotion speaker
// ========================================

import { getVoiceConnection } from '@discordjs/voice';
import logger from '../../bot/logger.js';
import stageSpeakerManager from './StageSpeakerManager.js';

class StageMonitor {
  constructor () {
    this.isMonitoring = false;
    this.checkInterval = 10000;
    this.monitoringInterval = null;
    this.connectedStages = new Map(); // guildId -> { channelId, guild, lastCheck }
    this.isDisconnecting = false;

    // Délai de grâce avant déconnexion (ms)
    this.disconnectGraceMs = 10000;

    // Suivi des canaux "vides" avec leur timestamp de vidage
    this.emptyStages = new Map(); // guildId -> timestamp (ms)

    // Garde-fou anti-boucle : guildIds en cours de promotion
    this.promotingStages = new Set();

    logger.info('StageMonitor initialisé');
  }

  startMonitoring () {
    if (this.isMonitoring) {
      logger.warn('StageMonitor déjà en cours de surveillance');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      void this.checkAllStages();
    }, this.checkInterval);

    logger.info(`🎭 Surveillance des stages démarrée (intervalle: ${this.checkInterval / 1000}s, grâce: ${this.disconnectGraceMs / 1000}s)`);
  }

  stopMonitoring () {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emptyStages.clear();
    this.promotingStages.clear();

    logger.info('🎭 Surveillance des stages arrêtée');
  }

  registerStage (guildId, channelId, guild = null) {
    this.connectedStages.set(guildId, {
      channelId,
      guild,
      lastCheck: Date.now()
    });

    // Si ce stage était marqué comme vide, le réinitialiser
    this.emptyStages.delete(guildId);

    logger.info(`🎭 Stage enregistré pour surveillance: ${guildId} -> ${channelId}`);
    void this.promoteBotInStage(guildId, channelId);
  }

  unregisterStage (guildId) {
    if (this.connectedStages.has(guildId)) {
      this.connectedStages.delete(guildId);
      this.emptyStages.delete(guildId);
      this.promotingStages.delete(guildId);
      logger.info(`🎭 Stage désenregistré de la surveillance: ${guildId}`);
    }
  }

  async promoteBotInStage (guildId, channelId) {
    // Garde-fou : ne pas lancer une promotion si une est déjà en cours pour ce guild
    if (this.promotingStages.has(guildId)) {
      logger.debug(`🎤 Promotion déjà en cours pour ${guildId}, ignorée`);
      return;
    }

    try {
      const connection = getVoiceConnection(guildId);
      if (!connection) {
        logger.warn(`🎤 Pas de connexion active pour promouvoir dans le stage ${channelId}`);
        return;
      }

      const stageInfo = this.connectedStages.get(guildId);
      const channel = stageInfo?.guild?.channels?.cache?.get(channelId);
      if (!channel) {
        logger.warn(`🎤 Canal introuvable pour promotion: ${channelId}`);
        return;
      }

      if (channel.type !== 13) {
        logger.debug(`🎤 Canal n'est pas un stage (type ${channel.type}), promotion ignorée`);
        return;
      }

      setTimeout(async () => {
        // Vérifier une dernière fois que le stage est toujours actif
        const activeConnection = getVoiceConnection(guildId);
        const activeStage = this.connectedStages.get(guildId);
        if (!activeConnection || activeStage?.channelId !== channelId) {
          logger.debug(`🎤 Promotion ignorée: stage ${channelId} inactif`);
          return;
        }

        // Vérifier si le bot est déjà speaker (suppress === false)
        const botMember = channel.guild?.members?.me;
        if (botMember?.voice?.channelId === channelId && botMember.voice.suppress === false) {
          logger.debug(`🎤 Bot déjà speaker dans ${channel.name}, promotion ignorée`);
          return;
        }

        this.promotingStages.add(guildId);
        try {
          const result = await stageSpeakerManager.promoteToSpeaker(activeConnection, channel);
          if (result.success) {
            logger.info(`🎤 Bot auto-promu en speaker dans ${channel.name}`);
          } else {
            logger.warn(`🎤 Échec auto-promotion dans ${channel.name}: ${result.message}`);
          }
        } finally {
          // Libérer le verrou après un délai pour absorber le VoiceStateUpdate
          // déclenché par setSuppressed(false)
          setTimeout(() => {
            this.promotingStages.delete(guildId);
            logger.debug(`🎤 Verrou de promotion libéré pour ${guildId}`);
          }, 5000);
        }
      }, 3000);
    } catch (error) {
      logger.error('🎤 Erreur lors de la tentative d\'auto-promotion:', error);
      this.promotingStages.delete(guildId);
    }
  }

  async checkAllStages () {
    if (this.connectedStages.size === 0) return;

    for (const [guildId, stageInfo] of this.connectedStages) {
      try {
        await this.checkStage(guildId, stageInfo.channelId);
      } catch (error) {
        logger.error(`Erreur lors de la vérification du stage ${guildId}:`, error);
      }
    }
  }

  async checkStage (guildId, channelId) {
    try {
      const connection = getVoiceConnection(guildId);

      if (!connection) {
        logger.info(`🎭 Connexion perdue pour ${guildId}, désenregistrement`);
        this.unregisterStage(guildId);
        return;
      }

      const connectedChannelId = connection.joinConfig.channelId;
      if (connectedChannelId !== channelId) {
        logger.warn(`🎭 Canal de connexion différent: attendu ${channelId}, trouvé ${connectedChannelId}`);
        return;
      }

      const stageInfo = this.connectedStages.get(guildId);
      const voiceChannel = stageInfo?.guild?.channels?.cache?.get(channelId);

      if (!voiceChannel) {
        logger.warn(`🎭 Canal vocal introuvable: ${channelId}`);
        this.unregisterStage(guildId);
        return;
      }

      const humanMembers = voiceChannel.members.filter(member => !member.user.bot);

      if (humanMembers.size === 0) {
        const now = Date.now();

        if (!this.emptyStages.has(guildId)) {
          this.emptyStages.set(guildId, now);
          logger.info(`🎭 Stage "${voiceChannel.name}" vide — déconnexion dans ${this.disconnectGraceMs / 1000}s si personne ne rejoint`);
        } else {
          const emptyFor = now - this.emptyStages.get(guildId);

          if (emptyFor >= this.disconnectGraceMs) {
            logger.info(`🎭 Délai de grâce écoulé (${Math.round(emptyFor / 1000)}s) pour "${voiceChannel.name}", déconnexion`);
            await this.disconnectFromStage(connection, guildId, voiceChannel);
          } else {
            const remaining = Math.round((this.disconnectGraceMs - emptyFor) / 1000);
            logger.debug(`🎭 Stage vide depuis ${Math.round(emptyFor / 1000)}s — déconnexion dans ${remaining}s`);
          }
        }
      } else {
        if (this.emptyStages.has(guildId)) {
          logger.info(`🎭 Humain(s) de retour dans "${voiceChannel.name}" — déconnexion annulée`);
          this.emptyStages.delete(guildId);
        }
      }
    } catch (error) {
      logger.error(`Erreur lors de la vérification du stage ${guildId}:`, error);
    }
  }

  async disconnectFromStage (connection, guildId, voiceChannel) {
    try {
      if (this.isDisconnecting) return;
      this.isDisconnecting = true;

      const player = connection?.state?.subscription?.player;
      if (player) {
        player.stop(true);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      connection.destroy();
      this.unregisterStage(guildId);

      logger.info(`🎭 Bot déconnecté du stage: "${voiceChannel.name}" (canal conservé)`);
    } catch (err) {
      logger.error('Erreur déconnexion stage:', err);
    } finally {
      this.isDisconnecting = false;
    }
  }

  handleVoiceStateUpdate (oldState, newState) {
    const botId = newState.guild?.members?.me?.id;

    // === Cas 1 : c'est le bot lui-même qui change d'état ===
    if (newState.member?.id === botId) {
      // Même canal → simple changement de statut (suppress toggle après promotion)
      // Ne pas re-enregistrer pour éviter la boucle promotion → VoiceStateUpdate → promotion
      if (oldState.channelId === newState.channelId) {
        logger.debug('🎭 VoiceStateUpdate du bot ignoré (changement de statut dans le même canal)');
        return;
      }

      // Le bot a rejoint un nouveau stage
      if (newState.channelId) {
        const newChannel = newState.channel;
        if (newChannel && newChannel.type === 13) {
          logger.info(`🎭 Bot a rejoint un stage: ${newChannel.name} (${newState.guild.id})`);
          this.registerStage(newState.guild.id, newState.channelId, newState.guild);
        }
      }

      return;
    }

    // === Cas 2 : un humain a quitté un canal surveillé ===
    if (oldState.channelId && this.connectedStages.has(oldState.guild.id)) {
      const stageInfo = this.connectedStages.get(oldState.guild.id);
      if (stageInfo.channelId === oldState.channelId) {
        setTimeout(() => {
          void this.checkStage(oldState.guild.id, stageInfo.channelId);
        }, 2000);
      }
    }
  }

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