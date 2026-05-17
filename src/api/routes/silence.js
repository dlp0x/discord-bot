// ========================================
// api/routes/silence.js - Endpoints pour le détecteur de silence
// ========================================

import express from 'express';
import getSilenceDetector from '../../core/services/SilenceDetector.js';
import logger from '#shared/logging/logger.js';

export default function silenceRoutes (client, loggerInstance = logger) {
  const router = express.Router();

  /**
   * GET /v1/silence/status
   * Obtenir le statut du détecteur de silence
   */
  router.get('/status', async (req, res) => {
    try {
      const silenceDetector = getSilenceDetector();
      const status = silenceDetector.getStatus();

      res.json({
        success: true,
        data: {
          ...status,
          uptime: client?.uptime || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      loggerInstance.error(
        'Erreur lors de la récupération du statut silence:',
        error
      );
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération du statut',
        message: error.message
      });
    }
  });

  /**
   * POST /v1/silence/start
   * Démarrer la surveillance du silence
   */
  router.post('/start', async (req, res) => {
    try {
      const silenceDetector = getSilenceDetector();
      silenceDetector.startMonitoring();

      const status = silenceDetector.getStatus();

      res.json({
        success: true,
        message: 'Surveillance du silence démarrée',
        data: {
          isMonitoring: status.isMonitoring,
          silenceThreshold: status.silenceThreshold,
          checkInterval: status.checkInterval,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      loggerInstance.error(
        'Erreur lors du démarrage de la surveillance:',
        error
      );
      res.status(500).json({
        success: false,
        error: 'Erreur lors du démarrage de la surveillance',
        message: error.message
      });
    }
  });

  /**
   * POST /v1/silence/stop
   * Arrêter la surveillance du silence
   */
  router.post('/stop', async (req, res) => {
    try {
      const silenceDetector = getSilenceDetector();
      silenceDetector.stopMonitoring();

      res.json({
        success: true,
        message: 'Surveillance du silence arrêtée',
        data: {
          isMonitoring: false,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      loggerInstance.error('Erreur lors de l\'arrêt de la surveillance:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'arrêt de la surveillance',
        message: error.message
      });
    }
  });

  /**
   * POST /v1/silence/config
   * Configurer le détecteur de silence
   */
  router.post('/config', async (req, res) => {
    try {
      const { threshold, interval, enableAlerts, alertChannelId, adminUserId }
        = req.body;

      const silenceDetector = getSilenceDetector();
      const newConfig = {};

      if (threshold !== undefined) {
        newConfig.silenceThreshold = threshold * 1000;
      }
      if (interval !== undefined) {
        newConfig.checkInterval = interval * 1000;
      }
      if (enableAlerts !== undefined) {
        newConfig.enableAlerts = enableAlerts;
      }
      if (alertChannelId !== undefined) {
        newConfig.alertChannelId = alertChannelId;
      }
      if (adminUserId !== undefined) {
        newConfig.adminUserId = adminUserId;
      }

      silenceDetector.updateConfig(newConfig);
      const status = silenceDetector.getStatus();

      res.json({
        success: true,
        message: 'Configuration mise à jour',
        data: {
          config: status.config,
          silenceThreshold: status.silenceThreshold,
          checkInterval: status.checkInterval,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      loggerInstance.error('Erreur lors de la configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la configuration',
        message: error.message
      });
    }
  });

  /**
   * POST /v1/silence/test
   * Tester le système d'alerte
   */
  router.post('/test', async (req, res) => {
    try {
      const silenceDetector = getSilenceDetector();
      const status = silenceDetector.getStatus();

      if (!status.isMonitoring) {
        return res.status(400).json({
          success: false,
          error: 'Le détecteur de silence n\'est pas actif'
        });
      }

      // Simuler une alerte de test
      const testMessage
        = '🧪 **TEST D\'ALERTE API**\n\n'
        + 'Ceci est un test du système d\'alerte de silence via l\'API.\n'
        + `⏰ Test effectué à: ${new Date().toLocaleString('fr-FR')}\n`
        + 'Le système fonctionne correctement.';

      const client = await silenceDetector.getDiscordClient();
      if (client) {
        await silenceDetector.sendDirectMessage(client, testMessage);

        res.json({
          success: true,
          message: 'Test d\'alerte envoyé avec succès',
          data: {
            recipients: status.alertRecipients,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Client Discord non disponible'
        });
      }
    } catch (error) {
      loggerInstance.error('Erreur lors du test d\'alerte:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du test d\'alerte',
        message: error.message
      });
    }
  });

  /**
   * GET /v1/silence/metrics
   * Obtenir les métriques du détecteur de silence
   */
  router.get('/metrics', async (req, res) => {
    try {
      const silenceDetector = getSilenceDetector();
      const status = silenceDetector.getStatus();

      const metrics = {
        isMonitoring: status.isMonitoring ? 1 : 0,
        alertSent: status.alertSent ? 1 : 0,
        alertRecipientsCount: status.alertRecipients.length,
        silenceDuration: status.silenceStartTime
          ? Math.floor((Date.now() - status.silenceStartTime) / 1000)
          : 0,
        lastAudioActivity: status.lastAudioActivity
          ? Math.floor((Date.now() - status.lastAudioActivity) / 1000)
          : 0,
        config: {
          silenceThreshold: status.silenceThreshold,
          checkInterval: status.checkInterval,
          enableAlerts: status.config.enableAlerts ? 1 : 0
        }
      };

      res.json({
        success: true,
        data: {
          ...metrics,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      loggerInstance.error(
        'Erreur lors de la récupération des métriques:',
        error
      );
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des métriques',
        message: error.message
      });
    }
  });

  return router;
}
