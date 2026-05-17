// ========================================
// api/routes/logs.js - Routes pour les logs centralisés
// ========================================

import express from 'express';
import logger from '#shared/logging/logger.js';
import { z } from 'zod';
import { getApiErrorMessage } from '../../core/monitor.js';
import { requireApiToken } from '../middlewares/auth.js';

const router = express.Router();

const logSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  message: z.string().min(1, 'Message is required'),
  meta: z.record(z.any()).optional()
});

/**
 * GET /v1/logs
 * Obtenir les logs récents
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 100, level, search } = req.query;

    let logs;
    if (search) {
      logs = await logger.searchLogs(search, {
        level: level || null,
        limit: parseInt(limit, 10)
      });
    } else {
      logs = await logger.getRecentLogs(parseInt(limit, 10), level || null);
    }

    res.json({
      success: true,
      data: {
        logs,
        total: logs.length,
        filters: {
          level: level || 'all',
          limit: parseInt(limit, 10),
          search: search || null
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des logs',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * GET /v1/logs/stats
 * Obtenir les statistiques des logs
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await logger.getLogStats();

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
 * GET /v1/logs/files
 * Obtenir la liste des fichiers de logs
 */
router.get('/files', async (req, res) => {
  try {
    const files = await logger.getLogFiles();

    res.json({
      success: true,
      data: {
        files: files.map((file) => ({
          name: file.split('/').pop(),
          path: file,
          size: 'N/A' // Taille pourrait être ajoutée si nécessaire
        })),
        total: files.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des fichiers de logs',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * GET /v1/logs/search
 * Rechercher dans les logs
 */
router.get('/search', async (req, res) => {
  try {
    const { query, level, startDate, endDate, limit = 100 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre "query" requis pour la recherche'
      });
    }

    const logs = await logger.searchLogs(query, {
      level: level || null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: parseInt(limit, 10)
    });

    res.json({
      success: true,
      data: {
        logs,
        total: logs.length,
        search: {
          query,
          level: level || 'all',
          startDate: startDate || null,
          endDate: endDate || null,
          limit: parseInt(limit, 10)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche dans les logs',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * POST /v1/logs
 * Écrire un nouveau log
 */
router.post('/', async (req, res) => {
  try {
    // Validation du body avec zod
    const parseResult = logSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.errors
      });
    }
    const { level, message, meta = {} } = parseResult.data;

    // Écrire le log
    await logger[level](message, meta);

    res.json({
      success: true,
      message: 'Log écrit avec succès',
      data: {
        level,
        message,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'écriture du log',
      message: getApiErrorMessage(error)
    });
  }
});

/**
 * DELETE /v1/logs
 * Nettoyer les anciens logs (admin seulement)
 */
router.delete('/', requireApiToken, async (req, res) => {
  try {
    const { maxAge = 24 * 60 * 60 * 1000 } = req.query; // 24 heures par défaut

    // Cette fonctionnalité pourrait être protégée par authentification
    // Pour l'instant, on l'expose directement

    await logger.cleanupOldLogs(parseInt(maxAge, 10));

    res.json({
      success: true,
      message: 'Nettoyage des anciens logs effectué',
      data: {
        maxAge: parseInt(maxAge, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du nettoyage des logs',
      message: getApiErrorMessage(error)
    });
  }
});

export default function () {
  return router;
}

