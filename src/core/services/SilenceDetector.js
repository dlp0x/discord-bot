// ========================================
// core/services/SilenceDetector.js - Détecteur de silence avec alertes Discord
// ========================================

import axios from 'axios';
import logger from '#shared/logging/logger.js';
import config from '#bot/config.js';
import cache from '#core/services/CacheService.js';
import { getClient, isClientReady } from '#bot/client.js';

class SilenceDetector {
  constructor () {
    this.isMonitoring = false;
    this.silenceThreshold = 10000; // 5 secondes de silence
    this.checkInterval = 15000; // Vérification toutes les 10 secondes
    this.lastAudioActivity = Date.now();
    this.silenceStartTime = null;
    this.alertSent = false;
    this.monitoringInterval = null;
    this.alertRecipients = new Set();

    // Configuration
    this.config = {
      streamUrl: config.STREAM_URL,
      jsonUrl: config.JSON_URL,
      silenceThreshold: parseInt(process.env.SILENCE_THRESHOLD, 10) || 5000,
      checkInterval: parseInt(process.env.SILENCE_CHECK_INTERVAL, 10) || 10000,
      enableAlerts: process.env.SILENCE_ALERTS_ENABLED !== 'false',
      alertChannelId: process.env.SILENCE_ALERT_CHANNEL_ID,
      adminUserId: process.env.ADMIN_USER_ID
    };

    logger.info('🔇 Détecteur de silence initialisé');
  }

  /**
   * Démarrer la surveillance du silence
   */
  startMonitoring () {
    if (this.isMonitoring) {
      logger.warn('La surveillance du silence est déjà active');
      return;
    }

    this.isMonitoring = true;
    this.lastAudioActivity = Date.now();
    this.silenceStartTime = null;
    this.alertSent = false;

    this.monitoringInterval = setInterval(() => {
      this.checkForSilence();
    }, this.config.checkInterval);

    logger.info('🔇 Surveillance du silence démarrée');
    logger.info(`Seuil de silence: ${this.config.silenceThreshold}ms`);
    logger.info(`Intervalle de vérification: ${this.config.checkInterval}ms`);
  }

  /**
   * Arrêter la surveillance du silence
   */
  stopMonitoring () {
    if (!this.isMonitoring) {
      logger.warn('La surveillance du silence n\'est pas active');
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.silenceStartTime = null;
    this.alertSent = false;

    logger.info('🔇 Surveillance du silence arrêtée');
  }

  /**
   * Vérifier s'il y a du silence
   */
  async checkForSilence () {
    try {
      const hasAudio = await this.detectAudioActivity();

      if (hasAudio) {
        // Audio détecté, réinitialiser les compteurs
        this.lastAudioActivity = Date.now();
        this.silenceStartTime = null;

        if (this.alertSent) {
          logger.info('🔊 Audio détecté - Silence terminé');
          this.alertSent = false;
          await this.sendAudioRestoredAlert();
        }
      } else {
        // Pas d'audio détecté
        const silenceDuration = Date.now() - this.lastAudioActivity;

        if (
          silenceDuration >= this.config.silenceThreshold
          && !this.alertSent
        ) {
          // Seuil de silence dépassé
          this.silenceStartTime = this.lastAudioActivity;
          this.alertSent = true;

          logger.warn(
            `🔇 Silence détecté depuis ${Math.floor(silenceDuration / 1000)}s`
          );
          await this.sendSilenceAlert(silenceDuration);
        }
      }
    } catch (error) {
      logger.error('Erreur lors de la vérification du silence:', error);
    }
  }

  /**
   * Détecter l'activité audio via l'API JSON
   */
  async detectAudioActivity () {
    try {
      const response = await cache.getOrSet(this.config.jsonUrl, async () => {
        // Utiliser l'import statique d'axios défini en haut du fichier
        return axios.get(this.config.jsonUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'soundSHINE-SilenceDetector/1.0'
          }
        });
      });

      const { data } = response;

      // Vérifier si le stream est actif
      if (data.icestats?.source) {
        const source = Array.isArray(data.icestats.source)
          ? data.icestats.source[0]
          : data.icestats.source;

        // Vérifier la présence de métadonnées audio
        if (source?.title && source.title !== 'Unknown') {
          return true;
        }

        // Vérifier les statistiques du stream
        if (source?.listeners && source.listeners > 0) {
          return true;
        }

        // Vérifier la qualité du stream
        if (source?.bitrate && source.bitrate > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Erreur lors de la détection audio:', error.message);
      return false; // En cas d'erreur, considérer comme silence
    }
  }

  /**
   * Envoyer une alerte de silence
   */
  async sendSilenceAlert (silenceDuration) {
    if (!this.config.enableAlerts) {
      logger.warn('Alertes de silence désactivées');
      return;
    }

    try {
      const client = await this.getDiscordClient();
      if (!client) {
        logger.error('Client Discord non disponible pour l\'alerte');
        return;
      }

      const silenceSeconds = Math.floor(silenceDuration / 1000);
      const message
        = '🔇 **ALERTE SILENCE**\n\n'
        + `Le stream audio est silencieux depuis **${silenceSeconds} secondes**.\n`
        + `⏰ Détecté à: ${new Date().toLocaleString('fr-FR')}\n`
        + `🔗 Stream URL: ${this.config.streamUrl}\n\n`
        + 'Vérifiez immédiatement l\'état du stream.';

      // Envoyer en MP aux administrateurs
      await this.sendDirectMessage(client, message);

      // Envoyer dans le canal d'alerte si configuré
      if (this.config.alertChannelId) {
        await this.sendChannelMessage(client, message);
      }

      logger.warn(`Alerte de silence envoyée (${silenceSeconds}s)`);
    } catch (error) {
      logger.error('Erreur lors de l\'envoi de l\'alerte de silence:', error);
    }
  }

  /**
   * Envoyer une alerte de restauration audio
   */
  async sendAudioRestoredAlert () {
    if (!this.config.enableAlerts) {
      return;
    }

    try {
      const client = await this.getDiscordClient();
      if (!client) {
        return;
      }

      const message
        = '🔊 **AUDIO RESTAURÉ**\n\n'
        + 'Le stream audio fonctionne à nouveau normalement.\n'
        + `⏰ Restauré à: ${new Date().toLocaleString('fr-FR')}\n`
        + '✅ Le problème de silence est résolu.';

      // Envoyer en MP aux administrateurs
      await this.sendDirectMessage(client, message);

      // Envoyer dans le canal d'alerte si configuré
      if (this.config.alertChannelId) {
        await this.sendChannelMessage(client, message);
      }

      logger.info('Alerte de restauration audio envoyée');
    } catch (error) {
      logger.error(
        'Erreur lors de l\'envoi de l\'alerte de restauration:',
        error
      );
    }
  }

  /**
   * Envoyer un message privé
   */
  async sendDirectMessage (client, message) {
    try {
      // Envoyer à l'administrateur principal
      if (this.config.adminUserId) {
        const adminUser = await client.users.fetch(this.config.adminUserId);
        if (adminUser) {
          await adminUser.send(message);
          logger.info(`Message privé envoyé à ${adminUser.tag}`);
        }
      }

      // Envoyer aux autres destinataires enregistrés
      for (const userId of this.alertRecipients) {
        try {
          const user = await client.users.fetch(userId);
          if (user) {
            await user.send(message);
            logger.info(`Message privé envoyé à ${user.tag}`);
          }
        } catch (error) {
          logger.warn(
            `Impossible d'envoyer un message à l'utilisateur ${userId}:`,
            error.message
          );
        }
      }
    } catch (error) {
      logger.error('Erreur lors de l\'envoi de messages privés:', error);
    }
  }

  /**
   * Envoyer un message dans le canal d'alerte
   */
  async sendChannelMessage (client, message) {
    try {
      const channel = await client.channels.fetch(this.config.alertChannelId);
      if (channel) {
        await channel.send(message);
        logger.info(`Message envoyé dans le canal ${channel.name}`);
      }
    } catch (error) {
      logger.error('Erreur lors de l\'envoi dans le canal d\'alerte:', error);
    }
  }

  /**
   * Obtenir le client Discord
   */
  async getDiscordClient () {
    try {
      if (!isClientReady()) {
        logger.error('Client Discord pas prêt');
        return null;
      }
  
      return getClient();
    } catch (error) {
      logger.error(
        'Erreur lors de l\'obtention du client Discord:',
        error
      );
      return null;
    }
  }

  /**
   * Ajouter un destinataire d'alerte
   */
  addAlertRecipient (userId) {
    this.alertRecipients.add(userId);
    logger.info(`Destinataire d'alerte ajouté: ${userId}`);
  }

  /**
   * Supprimer un destinataire d'alerte
   */
  removeAlertRecipient (userId) {
    this.alertRecipients.delete(userId);
    logger.info(`Destinataire d'alerte supprimé: ${userId}`);
  }

  /**
   * Obtenir le statut de surveillance
   */
  getStatus () {
    return {
      isMonitoring: this.isMonitoring,
      silenceThreshold: this.config.silenceThreshold,
      checkInterval: this.config.checkInterval,
      lastAudioActivity: this.lastAudioActivity,
      silenceStartTime: this.silenceStartTime,
      alertSent: this.alertSent,
      alertRecipients: Array.from(this.alertRecipients),
      config: {
        enableAlerts: this.config.enableAlerts,
        alertChannelId: this.config.alertChannelId,
        adminUserId: this.config.adminUserId
      }
    };
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig (newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Configuration du détecteur de silence mise à jour');
  }
}

// Instance singleton
let silenceDetectorInstance = null;

export default function getSilenceDetector () {
  if (!silenceDetectorInstance) {
    silenceDetectorInstance = new SilenceDetector();
  }
  return silenceDetectorInstance;
}
