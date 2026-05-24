import { MessageFlags } from 'discord.js';
import logger from '#shared/logging/logger.js';
import appState from './services/AppState.js';
import { generateErrorId } from '#shared/utils/generateErrorId.js';

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

  async checkHealth () {
    const appHealth = appState.isHealthy();

    return {
      status: appHealth.overall ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: appHealth.components,
      uptime: appHealth.components.bot.details.uptime
    };
  }

  async handle521Error (error, context = 'unknown') {
    const errorId = generateErrorId();
    const now = Date.now();


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


    if (this.error521Count >= this.max521ErrorsBeforeRestart && !this.isRestarting) {
      this.logger.warn(
        `REDEMARRAGE AUTOMATIQUE declenche apres ${this.error521Count} erreurs 521`
      );

      await this.performAutoRestart(errorId);
    } else if (!this.isRestarting) {
      this.logger.info(
        `⚠️ Erreur 521 detectee (${this.error521Count}/${this.max521ErrorsBeforeRestart}).
         Redemarrage automatique si repetition.`
      );
    }
  }

  /**
   * Effectue le redemarrage automatique
   */
  async performAutoRestart (errorId) {
    if (this.isRestarting) {
      this.logger.warn('Redemarrage deja en cours, abandon...');
      return;
    }

    this.isRestarting = true;

    try {
      this.logger.warn(`🔄 [${errorId}] DeBUT DU REDeMARRAGE AUTOMATIQUE`);

      // Notification critique
      this.sendCriticalAlert(
        new Error(`Redemarrage automatique suite a ${this.error521Count} erreurs 521`),
        errorId,
        'AUTO_RESTART_521'
      );

      // Attendre un peu pour permettre aux logs de se finaliser
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Redemarrage gracieux
      this.logger.warn('🔄 Redemarrage du processus Node.js...');

      // Reset du compteur avant redemarrage
      this.error521Count = 0;

      // Exit avec code 2 pour indiquer un redemarrage volontaire
      // (PM2, nodemon ou systemd peuvent relancer automatiquement)
      process.exit(2);
    } catch (restartError) {
      this.logger.error('Erreur lors du redemarrage automatique:', restartError);
      this.isRestarting = false;

      // Si le redemarrage echoue, essayer un arrêt d'urgence
      setTimeout(() => {
        this.logger.error('ARRÊT D\'URGENCE apres echec du redemarrage gracieux');
        process.exit(1);
      }, 5000);
    }
  }

  /**
   * Gere les erreurs de commandes Discord
   */
  async handleCommandError (error, interaction) {
    const errorId = generateErrorId();
    const errorType = this.categorizeError(error);

    // Verifier si c'est une erreur 521
    if (this.is521Error(error)) {
      await this.handle521Error(error, `COMMAND_${interaction?.commandName || 'unknown'}`);
      return;
    }

    // Mettre a jour les metriques via AppState
    this.updateMetric('commandsFailed');
    this.incrementErrorCount(errorType);

    // Log l'erreur avec contexte detaille
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

    // Reponse a l'utilisateur avec message approprie
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
   * Gere les erreurs API avec metriques
   */
  handleApiError (error, req, res) {
    // Verifier si c'est une erreur 521
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
   * Gere les erreurs critiques avec alerting
   */
  handleCriticalError (error, context = 'unknown') {
    // Verifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, context);
      return;
    }


    // Notification immediate
    const errorId = generateErrorId();
    this.sendCriticalAlert(error, errorId, context);

    // Arrêt gracieux si necessaire
    if (this.shouldShutdown(error)) {
      this.logger.error('Erreur critique detectee, arrêt de l\'application...');
      process.exit(1);
    }
  }

  /**
   * Gere les erreurs de tâches planifiees
   */
  handleTaskError (error, context = 'TASK') {
    // Verifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, context);
      return;
    }

    const errorId = generateErrorId();
    this.logger.error(
      `[${errorId}] ERREUR TÃ‚CHE [${context}]: ${error.message}`,
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
   * Gere les erreurs de base de donnees
   */
  handleDatabaseError (error, operation = 'unknown') {
    // Verifier si c'est une erreur 521
    if (this.is521Error(error)) {
      this.handle521Error(error, `DATABASE_${operation}`);
      return;
    }

    this.updateMetric('databaseErrors');

    const errorId = generateErrorId();
    this.logger.error(
      `[${errorId}] ERREUR BASE DE DONNeES [${operation}]: ${error.message}`,
      {
        errorId,
        operation,
        stack: error.stack
      }
    );

    // Mettre a jour le statut de sante via AppState
    appState.setDatabaseHealthy(false);

    if (this.shouldAlert('DATABASE')) {
      this.sendAlert('DATABASE', errorId);
    }
  }

  /**
   * Determine si une erreur est de type 521
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
   * Categorise les erreurs avec plus de precision
   */
  categorizeError (error) {
    // Verifier d'abord si c'est une erreur 521
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
   * Messages utilisateur-friendly ameliores
   */
  getUserFriendlyMessage (errorType) {
    const messages = {
      SERVER_521: '🔧 Le serveur est temporairement indisponible. Redemarrage automatique en cours...',
      NETWORK:
        '🌐 Probleme de connexion reseau. Reessayez dans quelques instants.',
      PERMISSION: '🔒 Permissions insuffisantes pour cette action.',
      AUTH: '🔑 Erreur d\'authentification. Contactez un administrateur.',
      RATE_LIMIT: '⏱️ Trop de requêtes. Attendez un moment avant de reessayer.',
      VOICE: '🎵 Erreur audio. Verifiez votre connexion vocale.',
      DATABASE: '💾 Erreur de base de donnees. Reessayez plus tard.',
      DISCORD_API: '🤖 Erreur Discord API. Reessayez plus tard.',
      TIMEOUT: '⏰ Delai d\'attente depasse. Reessayez plus tard.',
      UNKNOWN: '❓ Une erreur inattendue s\'est produite. Reessayez plus tard.'
    };

    return messages[errorType] || messages.UNKNOWN;
  }

  /**
   * Codes HTTP appropries
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

    // Nettoyer les anciennes entrees (plus de 5 minutes)
    for (const [key] of this.errorCounts) {
      if (key < minuteKey - 5) {
        this.errorCounts.delete(key);
      }
    }
  }

  /**
   * Determine si une alerte doit être envoyee
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
   * Determine si l'application doit s'arrêter
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
    this.logger.warn(`ðŸš¨ ALERTE: Trop d'erreurs ${errorType} (${errorId})`);
    // Ici on pourrait envoyer une notification Discord, email, etc.
  }

  /**
   * Envoie une alerte critique
   */
  sendCriticalAlert (error, errorId, context) {
    this.logger.error(`🚨 ALERTE CRITIQUE [${context}]: ${errorId}`);
    // Ici on pourrait envoyer une notification immediate
  }

  /**
   * Recupere les statistiques de performance depuis AppState
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
   * Methode pour tester manuellement le redemarrage (a des fins de debug)
   */
  testAutoRestart () {
    if (process.env.NODE_ENV !== 'development') {
      this.logger.warn('Test de redemarrage disponible uniquement en developpement');
      return;
    }

    this.logger.info('🧪 Test de redemarrage automatique...');
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
