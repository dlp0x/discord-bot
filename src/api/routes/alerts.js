// ========================================
// api/routes/alerts.js - Routes pour les alertes
// ========================================

import express from 'express';
import alertManager from '#core/services/AlertManager.js';
import { z } from 'zod';
import { getApiErrorMessage } from '../../core/monitor.js';
import { requireApiToken } from '../middlewares/auth.js';

const router = express.Router();

const alertSchema = z.object({
  type: z.string().min(1, 'Type is required'),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  message: z.string().min(1, 'Message is required'),
  data: z.record(z.any()).optional()
});

const thresholdsSchema = z.record(
  z.enum(['ping', 'memory', 'errors', 'uptime', 'apiLatency']),
  z.number().min(0)
);

/**
 * GET /v1/alerts
 * Obtenir toutes les alertes actives
 */
router.get('/', async (req, res) => {
  try {
    const { type, severity, limit = 50 } = req.query;

    let alerts = alertManager.getActiveAlerts();

    // Filtrer par type si spécifié
    if (type) {
      alerts = alerts.filter((alert) => alert.type === type);
    }

    // Filtrer par sévérité si spécifiée
    if (severity) {
      alerts = alerts.filter((alert) => alert.severity === severity);
    }

    // Limiter le nombre de résultats
    alerts = alerts.slice(0, parseInt(limit, 10));

    res.json({
      success: true,
      data: {
        alerts,
        total: alerts.length,
        filters: {
          type: type || 'all',
          severity: severity || 'all',
          limit: parseInt(limit, 10)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des alertes',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * GET /v1/alerts/stats
 * Obtenir les statistiques des alertes
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = alertManager.getAlertStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * GET /v1/alerts/:type
 * Obtenir les alertes par type
 */
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 50 } = req.query;

    const alerts = alertManager
      .getAlertsByType(type)
      .slice(0, parseInt(limit, 10));

    res.json({
      success: true,
      data: {
        alerts,
        total: alerts.length,
        type,
        limit: parseInt(limit, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des alertes par type',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * POST /v1/alerts
 * Créer une nouvelle alerte
 */
router.post('/', async (req, res) => {
  try {
    // Validation du body avec zod
    const parseResult = alertSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.errors
      });
    }
    const { type, severity, message, data = {} } = parseResult.data;

    // Créer l'alerte
    const alertId = alertManager.createAlert(type, severity, message, data);

    res.json({
      success: true,
      message: 'Alerte créée avec succès',
      data: {
        alertId,
        type,
        severity,
        message,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'alerte',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * PUT /v1/alerts/:alertId/resolve
 * Marquer une alerte comme résolue
 */
router.put('/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;

    alertManager.resolveAlert(alertId);

    res.json({
      success: true,
      message: 'Alerte marquée comme résolue',
      data: {
        alertId,
        resolvedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la résolution de l\'alerte',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * PUT /v1/alerts/thresholds
 * Mettre à jour les seuils d'alerte
 */
router.put('/thresholds', async (req, res) => {
  try {
    // Validation du body avec zod
    const parseResult = thresholdsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid thresholds object',
        details: parseResult.error.errors
      });
    }
    const thresholds = parseResult.data;

    // Mettre à jour les seuils
    alertManager.setThresholds(thresholds);

    res.json({
      success: true,
      message: 'Seuils d\'alerte mis à jour',
      data: {
        updatedThresholds: thresholds,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des seuils',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * GET /v1/alerts/thresholds
 * Obtenir les seuils d'alerte actuels
 */
router.get('/thresholds', async (req, res) => {
  try {
    const { thresholds } = alertManager;

    res.json({
      success: true,
      data: {
        thresholds,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des seuils',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * DELETE /v1/alerts
 * Nettoyer les anciennes alertes
 */
router.delete('/', requireApiToken, async (req, res) => {
  try {
    const { maxAge = 24 * 60 * 60 * 1000 } = req.query; // 24 heures par défaut

    const beforeCount = alertManager.getAlertStats().total;
    alertManager.cleanupOldAlerts(parseInt(maxAge, 10));
    const afterCount = alertManager.getAlertStats().total;

    res.json({
      success: true,
      message: 'Nettoyage des anciennes alertes effectué',
      data: {
        cleanedCount: beforeCount - afterCount,
        remainingCount: afterCount,
        maxAge: parseInt(maxAge, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du nettoyage des alertes',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * POST /v1/alerts/test
 * Tester le système d'alertes
 */
router.post('/test', async (req, res) => {
  try {
    const {
      type = 'test',
      severity = 'info',
      message = 'Test d\'alerte'
    } = req.body;

    const alertId = alertManager.createAlert(type, severity, message, {
      test: true,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Test d\'alerte envoyé avec succès',
      data: {
        alertId,
        type,
        severity,
        message,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test d\'alerte',
      message: getApiErrorMessage(error)
    });
  }
});

export default function () {
  return router;
}
