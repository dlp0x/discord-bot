// ========================================
// core/monitor.js - Gestion centralisée des erreurs et monitoring optimisé
// ========================================

import { MessageFlags } from 'discord.js';
import logger from '../bot/logger.js';
import appState from './services/AppState.js';
import { generateErrorId } from '../utils/shared/generateErrorId.js';

class Monitor {
  constructor (loggerInstance = logger) {
    this.logger = loggerInstance;
    this.errorCounts = new Map();
    this.maxErrorsPerMinute = 10;
    this.startTime = Date.now();
    this.error521Count = 0;
    this.max521ErrorsBeforeRestart = 1;
    this.last521ErrorTime = 0;
    this.error521ResetInterval = 300000; // 5 minutes
    this.isRestarting = false;
  }

  /**
   * Met à jour les métriques via AppState
   */
  updateMetric (metricName) {
    switch (metricName) {
    case 'commandsExecuted':
      appState.incrementCommandsExecuted();
      break;
    case 'commandsFailed':
      appState.incrementCommandsFailed();
      break;
    case 'apiRequests':
      appState.incrementRequestsHandled();
      break;
    case 'apiErrors':
      appState.incrementRequestsFailed();
      break;
    case 'databaseQueries':
      appState.incrementQueriesExecuted();
      break;
    case 'databaseErrors':
      appState.incrementQueriesFailed();
      break;
    default:
      break;
    }
  }

  /**
   * Récupère les métriques depuis AppState
   */
  getMetrics () {
    const fullState = appState.getFullState();
    return {
      commandsExecuted: fullState.bot.commandsExecuted,
      commandsFailed: fullState.bot.commandsFailed,
      apiRequests: fullState.api.requestsHandled,
      apiErrors: fullState.api.requestsFailed,
      databaseQueries: fullState.database.queriesExecuted,
      databaseErrors: fullState.database.queriesFailed,
      uptime: fullState.bot.uptime,
      errorCounts: Object.fromEntries(this.errorCounts),
      error521Count: this.error521Count,
      healthStatus: {
        database: fullState.database.isHealthy,
        discord: fullState.bot.isReady,
        api: fullState.api.isRunning
      }
    };
  }

  /**
   * Vérifie l'état de santé du système via AppState //
   */
  async checkHealth () {
    const appHealth = appState.isHealthy();

    return {
      status: appHealth.overall ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: appHealth.components,
      uptime: appHealth.components.bot.details.uptime
    };
  }

  /**
   * Gère spécifiquement les erreurs 521
   */
  async handle521Error (error, context = 'unknown') {
    const errorId = generateErrorId();
    const now = Date.now();

    // Reset du compteur si plus de 5 minutes depuis la dernière erreur 521
    if (now - this.last521ErrorTime > this.error521ResetInterval) {
      this.error521Count = 0;
    }

    this.error521Count++;
    this.last521ErrorTime = now;

    this.logger.error(
      `[${errorId}] ERREUR 521 - Web Server Down [${context}] 
        (${this.error521Count}/${this.max521ErrorsBeforeRestart})`,
      {
        errorId,
        context,
        error521Count: this.error521Count,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        message: error.message
      }
    );

    // Si on atteint le seuil et qu'on n'est pas déjà en train de redémarrer
    if (this.error521Count >= this.max521ErrorsBeforeRestart && !this.isRestarting) {
      this.logger.warn(
        `🔄 REDÉMARRAGE AUTOMATIQUE déclenché après ${this.error521Count} erreurs 521`
      );

      await this.performAutoRestart(errorId);
    } else if (!this.isRestarting) {
      this.logger.info(
        `⚠️ Erreur 521 détectée (${this.error521Count}/${this.max521ErrorsBeforeRestart}).
         Redémarrage automatique si répétition.`
      );
    }
  }

  /**
   * Effectue le redémarrage automatique
   */
  async performAutoRestart (errorId) {
    if (this.isRestarting) {
      this.logger.warn('Redémarrage déjà en cours, abandon...');
      return;
    }

    this.isRestarting = true;

    try {
      this.logger.warn(`🔄 [${errorId}] DÉBUT DU REDÉMARRAGE AUTOMATIQUE`);

      // Notification critique
      this.sendCriticalAlert(
        new Error(`Redémarrage automatique suite à ${this.error521Count} erreurs 521`),
        errorId,
        'AUTO_RESTART_521'
      );

      // Attendre un peu pour permettre aux logs de se finaliser
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Redémarrage gracieux
      this.logger.warn('🔄 Redémarrage du processus Node.js...');

      // Reset du compteur avant redémarrage
      this.error521Count = 0;

      // Exit avec code 2 pour indiquer un redémarrage volontaire
      // (PM2, nodemon ou systemd peuvent relancer automatiquement)
      process.exit(2);
    } catch (restartError) {
      this.logger.error('Erreur lors du redémarrage automatique:', restartError);
      this.isRestarting = false;

      // Si le redémarrage échoue, essayer un arrêt d'urgence
      setTimeout(() => {
        this.logger.error('ARRÊT D\'URGENCE après échec du redémarrage gracieux');
        process.exit(1);
      }, 5000);
    }
  }

  /**
   * Gère les erreurs de commandes Discord
   */
  async handleCommandError (error, interaction) {
    const errorId = generateErrorId();
    const errorType = this.categorizeError(error);

    // Vérifier si c'est une erreur 521
    if (this.is521Error(error)) {
      await this.handle521Error(error, `COMMAND_${interaction?.commandName || 'unknown'}`);
      return;
    }

    // Mettre à jour les métriques via AppState
    this.updateMetric('commandsFailed');
    this.incrementErrorCount(errorType);

    // Log l'erreur avec contexte détaillé
    this.logger.error(
      `[${errorId}] Erreur commande ${interaction?.commandName || 'unknown'}: ${
        error.message
      }`,
      {
        errorId,
        commandName: interaction?.commandName,
        userId: interaction?.user?.id,
        guildId: interaction?.guild?.id,
        channelId: interaction?.channel?.id,
        errorType,
        stack: error.stack
      }
    );

    // Réponse à l'utilisateur avec message approprié
    if (interaction && !interaction.replied && !interaction.deferred) {
      const userMessage = this.getUserFriendlyMessage(errorType);
      await interaction.reply({
        content: userMessage,
        flags: MessageFlags.Ephemeral
      });
    } else if (interaction && (interaction.replied || interaction.deferred)) {
      const userMessage = this.getUserFriendlyMessage(errorType);
      await interaction.editReply({
        content: userMessage
      });
    }

    // Alert si trop d'erreurs
    if (this.shouldAlert(errorType)) {
      this.sendAlert(errorType, errorId);
    }
  }

  /**
   * Gère les erreurs API avec métriques
   */
  handleApiError (error, req, res) {
    // Vérifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, `API_${req?.method}_${req?.path}`);
      return;
    }

    this.updateMetric('apiErrors');

    if (typeof res.status === 'function' && typeof res.json === 'function') {
      const errorId = generateErrorId();
      const errorType = this.categorizeError(error);

      this.logger.error(
        `[${errorId}] Erreur API ${req?.method} ${req?.path}: ${error.message}`,
        {
          errorId,
          method: req?.method,
          path: req?.path,
          userAgent: req?.headers?.['user-agent'],
          ip: req?.ip,
          errorType
        }
      );

      const statusCode = this.getHttpStatusCode(errorType);
      const response = {
        error: this.getUserFriendlyMessage(errorType),
        errorId,
        timestamp: new Date().toISOString(),
        path: req?.path
      };

      res.status(statusCode).json(response);
    } else {
      this.logger.error(
        'handleApiError: res is not a valid Express response object'
      );

      if (
        typeof res?.writeHead === 'function'
        && typeof res?.end === 'function'
      ) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Internal server error',
            timestamp: new Date().toISOString()
          })
        );
      }
    }
  }

  /**
   * Gère les erreurs critiques avec alerting
   */
  handleCriticalError (error, context = 'unknown') {
    // Vérifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, context);
      return;
    }

    const errorId = generateErrorId();

    this.logger.error(
      `[${errorId}] ERREUR CRITIQUE [${context}]: ${error.message}`,
      {
        errorId,
        context,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );

    // Notification immédiate
    this.sendCriticalAlert(error, errorId, context);

    // Arrêt gracieux si nécessaire
    if (this.shouldShutdown(error)) {
      this.logger.error('Erreur critique détectée, arrêt de l\'application...');
      process.exit(1);
    }
  }

  /**
   * Gère les erreurs de tâches planifiées
   */
  handleTaskError (error, context = 'TASK') {
    // Vérifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, context);
      return;
    }

    const errorId = generateErrorId();
    this.logger.error(
      `[${errorId}] ERREUR TÂCHE [${context}]: ${error.message}`,
      {
        errorId,
        context,
        stack: error.stack
      }
    );

    if (this.shouldAlert('TASK')) {
      this.sendAlert('TASK', errorId);
    }
  }

  /**
   * Gère les erreurs de base de données
   */
  handleDatabaseError (error, operation = 'unknown') {
    // Vérifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, `DATABASE_${operation}`);
      return;
    }

    this.updateMetric('databaseErrors');

    const errorId = generateErrorId();
    this.logger.error(
      `[${errorId}] ERREUR BASE DE DONNÉES [${operation}]: ${error.message}`,
      {
        errorId,
        operation,
        stack: error.stack
      }
    );

    // Mettre à jour le statut de santé via AppState
    appState.setDatabaseHealthy(false);

    if (this.shouldAlert('DATABASE')) {
      this.sendAlert('DATABASE', errorId);
    }
  }

  /**
   * Détermine si une erreur est de type 521
   */
  is521Error (error) {
    if (!error) return false;

    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    const code = error.code || '';
    const status = error.status || error.response?.status || 0;

    return (
      status === 521
      || code === '521'
      || message.includes('521')
      || message.includes('web server is down')
      || message.includes('origin server down')
      || (code === 'ECONNREFUSED' && message.includes('cloudflare'))
      || (message.includes('cloudflare') && message.includes('down'))
    );
  }

  /**
   * Catégorise les erreurs avec plus de précision
   */
  categorizeError (error) {
    // Vérifier d'abord si c'est une erreur 521
    if (this.is521Error(error)) {
      return 'SERVER_521';
    }

    const msg
      = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    const code = error.code || '';

    if (
      code === 'ECONNREFUSED'
      || code === 'ENOTFOUND'
      || msg.includes('network')
    )
      return 'NETWORK';
    if (code === 'EACCES' || code === 'EPERM' || msg.includes('permission'))
      return 'PERMISSION';
    if (
      code === 'EAUTH'
      || msg.includes('token')
      || msg.includes('authentication')
    )
      return 'AUTH';
    if (
      code === 'RATE_LIMIT'
      || msg.includes('rate limit')
      || msg.includes('too many requests')
    )
      return 'RATE_LIMIT';
    if (msg.includes('voice') || msg.includes('audio')) return 'VOICE';
    if (
      msg.includes('database')
      || msg.includes('sql')
      || msg.includes('connection')
    )
      return 'DATABASE';
    if (msg.includes('discord') || msg.includes('api')) return 'DISCORD_API';
    if (msg.includes('timeout')) return 'TIMEOUT';

    return 'UNKNOWN';
  }

  /**
   * Messages utilisateur-friendly améliorés
   */
  getUserFriendlyMessage (errorType) {
    const messages = {
      SERVER_521: '🔧 Le serveur est temporairement indisponible. Redémarrage automatique en cours...',
      NETWORK:
        '🌐 Problème de connexion réseau. Réessayez dans quelques instants.',
      PERMISSION: '🔒 Permissions insuffisantes pour cette action.',
      AUTH: '🔑 Erreur d\'authentification. Contactez un administrateur.',
      RATE_LIMIT: '⏱️ Trop de requêtes. Attendez un moment avant de réessayer.',
      VOICE: '🎵 Erreur audio. Vérifiez votre connexion vocale.',
      DATABASE: '💾 Erreur de base de données. Réessayez plus tard.',
      DISCORD_API: '🤖 Erreur Discord API. Réessayez plus tard.',
      TIMEOUT: '⏰ Délai d\'attente dépassé. Réessayez plus tard.',
      UNKNOWN: '❓ Une erreur inattendue s\'est produite. Réessayez plus tard.'
    };

    return messages[errorType] || messages.UNKNOWN;
  }

  /**
   * Codes HTTP appropriés
   */
  getHttpStatusCode (errorType) {
    const codes = {
      SERVER_521: 521,
      NETWORK: 503,
      PERMISSION: 403,
      AUTH: 401,
      RATE_LIMIT: 429,
      VOICE: 400,
      DATABASE: 500,
      DISCORD_API: 502,
      TIMEOUT: 408,
      UNKNOWN: 500
    };

    return codes[errorType] || 500;
  }

  /**
   * Compteur d'erreurs par minute
   */
  incrementErrorCount (errorType) {
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000);

    if (!this.errorCounts.has(minuteKey)) {
      this.errorCounts.set(minuteKey, new Map());
    }

    const minuteCounts = this.errorCounts.get(minuteKey);
    minuteCounts.set(errorType, (minuteCounts.get(errorType) || 0) + 1);

    // Nettoyer les anciennes entrées (plus de 5 minutes)
    for (const [key] of this.errorCounts) {
      if (key < minuteKey - 5) {
        this.errorCounts.delete(key);
      }
    }
  }

  /**
   * Détermine si une alerte doit être envoyée
   */
  shouldAlert (errorType) {
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000);
    const minuteCounts = this.errorCounts.get(minuteKey);

    if (!minuteCounts) return false;

    const count = minuteCounts.get(errorType) || 0;
    return count >= this.maxErrorsPerMinute;
  }

  /**
   * Détermine si l'application doit s'arrêter
   */
  shouldShutdown (error) {
    const criticalErrors = ['AUTH', 'DATABASE'];
    const errorType = this.categorizeError(error);
    return criticalErrors.includes(errorType);
  }

  /**
   * Envoie une alerte
   */
  sendAlert (errorType, errorId) {
    this.logger.warn(`🚨 ALERTE: Trop d'erreurs ${errorType} (${errorId})`);
    // Ici on pourrait envoyer une notification Discord, email, etc.
  }

  /**
   * Envoie une alerte critique
   */
  sendCriticalAlert (error, errorId, context) {
    this.logger.error(`🚨 ALERTE CRITIQUE [${context}]: ${errorId}`);
    // Ici on pourrait envoyer une notification immédiate
  }

  /**
   * Génère un ID d'erreur unique
   */
  generateErrorId () {
    return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Récupère les statistiques de performance depuis AppState
   */
  getPerformanceStats () {
    const fullState = appState.getFullState();
    return {
      uptime: fullState.bot.uptime,
      memory: fullState.system.memoryUsage,
      metrics: this.getMetrics(),
      error521Count: this.error521Count,
      health: {
        database: fullState.database.isHealthy,
        discord: fullState.bot.isReady,
        api: fullState.api.isRunning
      }
    };
  }

  /**
   * Méthode pour tester manuellement le redémarrage (à des fins de debug)
   */
  testAutoRestart () {
    if (process.env.NODE_ENV !== 'development') {
      this.logger.warn('Test de redémarrage disponible uniquement en développement');
      return;
    }

    this.logger.info('🧪 Test de redémarrage automatique...');
    this.error521Count = this.max521ErrorsBeforeRestart;
    this.handle521Error(new Error('Test 521 error'), 'MANUAL_TEST');
  }
}

// Instance singleton
const monitor = new Monitor();

// Fonction utilitaire pour les messages d'erreur API
export function getApiErrorMessage (error) {
  return monitor.getUserFriendlyMessage(monitor.categorizeError(error));
}

export default monitor;
