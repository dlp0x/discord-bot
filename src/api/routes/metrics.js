// ========================================
// routes/metrics.js
// ========================================

import { Router } from 'express';
import os from 'os';
import metricsCollector from '#core/services/MetricsCollector.js';

export default (client, logger) => {
  const router = Router();

  /**
   * GET /v1/metrics
   * Métriques au format JSON (compatible avec l'existant)
   */
  router.get('/', (req, res) => {
    try {
      const startTime = Date.now();

      // Métriques système
      const systemMetrics = {
        uptime: process.uptime(),
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
          rss: process.memoryUsage().rss
        },
        cpu: {
          loadAverage: os.loadavg(),
          cores: os.cpus().length
        },
        platform: {
          os: os.platform(),
          arch: os.arch(),
          nodeVersion: process.version,
          pid: process.pid
        }
      };

      // Métriques Discord
      const discordMetrics = {
        status: client?.user ? 'online' : 'offline',
        ping: client?.ws?.ping || 0,
        guilds: client?.guilds?.cache?.size || 0,
        users: client?.users?.cache?.size || 0,
        channels: client?.channels?.cache?.size || 0,
        uptime: client?.uptime || 0,
        readyAt: client?.readyAt?.toISOString() || null
      };

      // Métriques du bot
      const botMetrics = {
        commands: client?.commands?.size || 0,
        voiceConnections: client?.voice?.adapters?.size || 0,
        lastActivity: new Date().toISOString()
      };


      const metrics = {
        system: systemMetrics,
        discord: discordMetrics,
        bot: botMetrics,
      };

      // Log de l'accès aux métriques
      logger.custom(
        'METRICS',
        `Métriques JSON demandées par ${req.ip}`,
        'cyan'
      );

      res.json(metrics);
    } catch (error) {
      logger.error('Erreur route metrics:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /v1/metrics/json
   * Métriques au format JSON structuré
   */
  router.get('/json', async (req, res) => {
    try {
      // Mettre à jour les métriques avant de les récupérer
      metricsCollector.updateDiscordMetrics(client);
      metricsCollector.updateSystemMetrics();

      const jsonMetrics = await metricsCollector.getMetricsJson();

      res.json({
        success: true,
        data: {
          metrics: jsonMetrics,
          timestamp: new Date().toISOString()
        }
      });

      logger.custom(
        'METRICS',
        `Métriques JSON structurées demandées par ${req.ip}`,
        'cyan'
      );
    } catch (error) {
      logger.error('Erreur route metrics JSON:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des métriques JSON',
        message: error.message
      });
    }
  });

  /**
   * GET /v1/metrics/summary
   * Résumé des métriques principales
   */
  router.get('/summary', (req, res) => {
    try {
      const summary = {
        bot: {
          status: client?.user ? 'online' : 'offline',
          uptime: process.uptime(),
          guilds: client?.guilds?.cache?.size || 0,
          users: client?.users?.cache?.size || 0,
          ping: client?.ws?.ping || 0
        },
        system: {
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
          },
          cpu: {
            loadAverage: os.loadavg()[0].toFixed(2),
            cores: os.cpus().length
          }
        },
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: summary
      });

      logger.custom(
        'METRICS',
        `Résumé des métriques demandé par ${req.ip}`,
        'cyan'
      );
    } catch (error) {
      logger.error('Erreur route metrics summary:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération du résumé',
        message: error.message
      });
    }
  });

  return router;
};

