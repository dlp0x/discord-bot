// api/server.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import corsMiddleware from './middlewares/cors.js';
import helmetMiddleware from './middlewares/helmet.js';
import loggingMiddleware from '#shared/logging/api.js';
import loadRoutes from './routes.js';
import monitor from '#core/monitor.js';
import {
  validateInput,
  xssProtection,
  sqlInjectionProtection,
  validateHeaders,
  secureRequestLogging,
  dosProtection,
  timeoutProtection
} from '../core/middleware/security.js';
import { generateErrorId } from '#shared/utils/generateErrorId.js';

class WebServer {
  constructor (client, logger) {
    this.client = client;
    this.logger = logger;
    this.app = express();
    this.app.set('trust proxy', 1);
    this.server = null;
  }

  setupMiddleware () {
    try {
      // Middlewares de sécurité critiques
      this.app.use(helmetMiddleware);
      this.app.use(corsMiddleware);
      this.app.use(dosProtection);
      this.app.use(timeoutProtection(30000)); // 30 secondes max
      this.app.use(validateHeaders);
      this.app.use(xssProtection);
      this.app.use(sqlInjectionProtection);
      this.app.use(validateInput);
      // Rate limiting standard
      this.app.use(
        rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 100,
          message:
            'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
          standardHeaders: true,
          legacyHeaders: false
        })
      );

      // Parsing des données
      this.app.use(express.json({ limit: '10mb' }));
      this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

      // Logging sécurisé
      this.app.use(secureRequestLogging);
      this.app.use(loggingMiddleware());
    } catch (error) {
      monitor.handleCriticalError(error, 'MIDDLEWARE_SETUP');
      throw error;
    }
  }

  setupRoutes () {
    try {
      loadRoutes(this.app, this.client, this.logger);
      this.logger.api('Routes chargées');
    } catch (error) {
      monitor.handleCriticalError(error, 'ROUTES_SETUP');
      throw error;
    }
  }

  setupErrorHandling () {
    this.app.use((err, req, res, _next) => {
      // Générer un ID d'erreur unique
      const errorId = generateErrorId();

      // Log sécurisé de l'erreur
      this.logger.error(`[${errorId}] Erreur API: ${err.message}`, {
        errorId,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });

      // Réponse sécurisée (ne pas exposer les détails internes)
      const response = {
        error: 'Erreur interne du serveur',
        errorId,
        timestamp: new Date().toISOString()
      };

      // En développement, ajouter plus de détails
      if (process.env.NODE_ENV === 'development') {
        response.debug = {
          message: err.message,
          stack: err.stack
        };
      }

      res.status(500).json(response);
    });
  }

  generateErrorId () {
    return (
      Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15)
    );
  }

  start (port) {
    try {
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();

      this.server = this.app.listen(port, () => {});

      this.server.on('error', (error) => {
        monitor.handleCriticalError(error, 'SERVER_ERROR');
        this.logger.error(`Erreur serveur: ${error.message}`);
      });

      return this.server;
    } catch (error) {
      monitor.handleCriticalError(error, 'SERVER_START');
      throw error;
    }
  }

  async stop () {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server.close((err) => {
          if (err) {
            monitor.handleCriticalError(err, 'SERVER_STOP');
            reject(err);
          } else {
            this.logger.success('Serveur Express arrêté proprement');
            resolve();
          }
        });
      });
    }
  }
}

export default WebServer;

