// ========================================
// utils/alerts.js - Système d'alertes avancé
// ========================================
import os from "os";
import { WebhookClient, EmbedBuilder } from "discord.js";
import logger from '#shared/logging/logger.js';

class AlertManager {
  constructor() {
    this.alerts = new Map();
    this.thresholds = {
      ping: 500, // ms
      memory: 0.8, // 80% de la mémoire
      errors: 10, // erreurs par minute
      uptime: 3600, // 1 heure minimum
      apiLatency: 2000, // 2 secondes
    };

    this.webhookClient = null;
    this.alertChannelId = process.env.ALERT_CHANNEL_ID;
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL;

    if (this.webhookUrl) {
      this.webhookClient = new WebhookClient({ url: this.webhookUrl });
      logger.info("🔔 Système d'alertes webhook initialisé");
    }
    logger.banner("Initialisation du bot Discord...");
    logger.init("Système d'alertes initialisé");
  }

  /**
   * Définir les seuils d'alerte
   */
  setThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info("Seuils d'alerte mis à jour:", this.thresholds);
  }

  /**
   * Créer une alerte
   */
  createAlert(type, severity, message, data = {}) {
    const alertId = `${type}_${Date.now()}`;
    const alert = {
      id: alertId,
      type,
      severity, // 'info', 'warning', 'error', 'critical'
      message,
      data,
      timestamp: new Date(),
      acknowledged: false,
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    // Envoyer la notification
    this.sendNotification(alert);

    logger.warn(`🚨 Alerte créée: ${type} - ${severity} - ${message}`);
    return alertId;
  }

  /**
   * Envoyer une notification Discord
   */
  async sendNotification(alert) {
    try {
      if (!this.webhookClient) {
        logger.debug("Webhook non configuré, notification ignorée");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚨 Alerte ${alert.severity.toUpperCase()}`)
        .setDescription(alert.message)
        .setColor(this.getSeverityColor(alert.severity))
        .addFields([
          { name: "Type", value: alert.type, inline: true },
          { name: "Sévérité", value: alert.severity, inline: true },
          {
            name: "Timestamp",
            value: alert.timestamp.toISOString(),
            inline: true,
          },
        ])
        .setTimestamp();

      // Ajouter des données supplémentaires si disponibles
      if (Object.keys(alert.data).length > 0) {
        const dataField = Object.entries(alert.data)
          .map(([key, value]) => `**${key}:** ${value}`)
          .join("\n");
        embed.addFields({ name: "Détails", value: dataField });
      }

      await this.webhookClient.send({
        embeds: [embed],
        username: "soundSHINE Alert System",
        avatarURL:
          "https://cdn.discordapp.com/avatars/123456789/alert-icon.png",
      });

      logger.info(`Notification d'alerte envoyée: ${alert.type}`);
    } catch (error) {
      logger.error("Erreur lors de l'envoi de la notification:", error);
    }
  }

  /**
   * Obtenir la couleur selon la sévérité
   */
  getSeverityColor(severity) {
    const colors = {
      info: 0x3498db, // Bleu
      warning: 0xf39c12, // Orange
      error: 0xe74c3c, // Rouge
      critical: 0x8e44ad, // Violet
    };
    return colors[severity] || colors.info;
  }

  /**
   * Vérifier les métriques et créer des alertes si nécessaire
   */
  async checkMetrics(client) {
    try {
      // Vérifier le ping Discord
      const ping = client.ws?.ping || 0;
      if (ping > this.thresholds.ping) {
        this.createAlert(
          "high_ping",
          ping > 1000 ? "critical" : "warning",
          `Latence Discord élevée: ${ping}ms`,
          { ping, threshold: this.thresholds.ping }
        );
      }

      // Vérifier l'utilisation mémoire basée sur RSS (résident set size)
      const memUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const rssPercent = memUsage.rss / totalMemory;

      if (rssPercent > this.thresholds.memory) {
        this.createAlert(
          "high_memory",
          rssPercent > 0.9 ? "critical" : "warning",
          `Utilisation mémoire élevée: ${(rssPercent * 100).toFixed(1)}%`,
          {
            rssMB: (memUsage.rss / 1024 / 1024).toFixed(2),
            totalMB: (totalMemory / 1024 / 1024).toFixed(2),
            percent: (rssPercent * 100).toFixed(1),
            threshold: `${(this.thresholds.memory * 100).toFixed(0)}%`,
          }
        );
      }

      // Vérifier l'uptime
      const uptime = client.uptime || 0;
      if (uptime < this.thresholds.uptime * 1000) {
        this.createAlert(
          "low_uptime",
          "warning",
          `Uptime faible: ${Math.floor(uptime / 1000)}s`,
          { uptime: uptime / 1000, threshold: this.thresholds.uptime }
        );
      }

      // Vérifier le nombre de serveurs
      const guilds = client.guilds?.cache?.size || 0;
      if (guilds === 0) {
        this.createAlert(
          "no_guilds",
          "error",
          "Le bot n'est connecté à aucun serveur",
          { guilds }
        );
      }

      logger.debug("Vérification des métriques terminée");
    } catch (error) {
      logger.error("Erreur lors de la vérification des métriques:", error);
      this.createAlert(
        "metrics_check_error",
        "error",
        "Erreur lors de la vérification des métriques",
        { error: error.message }
      );
    }
  }

  /**
   * Vérifier les erreurs récentes
   */
  checkErrorRate() {
    try {
      // Cette méthode pourrait être étendue pour analyser les logs récents
      // et détecter des patterns d'erreurs
      const recentErrors = this.getRecentErrors();

      if (recentErrors.length > this.thresholds.errors) {
        this.createAlert(
          "high_error_rate",
          "error",
          `Taux d'erreurs élevé: ${recentErrors.length} erreurs récentes`,
          { errorCount: recentErrors.length, threshold: this.thresholds.errors }
        );
      }
    } catch (error) {
      logger.error("Erreur lors de la vérification du taux d'erreurs:", error);
    }
  }

  /**
   * Obtenir les erreurs récentes (placeholder)
   */
  getRecentErrors() {
    // Cette méthode devrait être implémentée pour analyser les logs
    // Pour l'instant, retourne un tableau vide
    return [];
  }

  /**
   * Marquer une alerte comme résolue
   */
  resolveAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();

      // Envoyer une notification de résolution
      this.sendResolutionNotification(alert);

      logger.info(`Alerte résolue: ${alertId}`);
    }
  }

  /**
   * Envoyer une notification de résolution
   */
  async sendResolutionNotification(alert) {
    try {
      if (!this.webhookClient) return;

      const embed = new EmbedBuilder()
        .setTitle("✅ Alerte résolue")
        .setDescription(alert.message)
        .setColor(0x27ae60) // Vert
        .addFields([
          { name: "Type", value: alert.type, inline: true },
          {
            name: "Résolue à",
            value: alert.resolvedAt.toISOString(),
            inline: true,
          },
        ])
        .setTimestamp();

      await this.webhookClient.send({
        embeds: [embed],
        username: "soundSHINE Alert System",
        avatarURL:
          "https://cdn.discordapp.com/avatars/123456789/resolved-icon.png",
      });
    } catch (error) {
      logger.error(
        "Erreur lors de l'envoi de la notification de résolution:",
        error
      );
    }
  }

  /**
   * Obtenir toutes les alertes actives
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter((alert) => !alert.resolved);
  }

  /**
   * Obtenir les alertes par type
   */
  getAlertsByType(type) {
    return Array.from(this.alerts.values()).filter(
      (alert) => alert.type === type
    );
  }

  /**
   * Nettoyer les anciennes alertes
   */
  cleanupOldAlerts(maxAge = 24 * 60 * 60 * 1000) {
    // 24 heures par défaut
    const now = Date.now();
    const toDelete = [];

    for (const [id, alert] of this.alerts) {
      if (now - alert.timestamp.getTime() > maxAge) {
        toDelete.push(id);
      }
    }

    toDelete.forEach((id) => this.alerts.delete(id));

    if (toDelete.length > 0) {
      logger.info(`${toDelete.length} anciennes alertes supprimées`);
    }
  }

  /**
   * Obtenir des statistiques d'alertes
   */
  getAlertStats() {
    const alerts = Array.from(this.alerts.values());
    const stats = {
      total: alerts.length,
      active: alerts.filter((a) => !a.resolved).length,
      resolved: alerts.filter((a) => a.resolved).length,
      bySeverity: {},
      byType: {},
    };

    alerts.forEach((alert) => {
      stats.bySeverity[alert.severity] =
        (stats.bySeverity[alert.severity] || 0) + 1;
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Enregistrer une erreur
   */
  recordError(errorType, context = "unknown") {
    try {
      this.createAlert(
        "error_recorded",
        "error",
        `Erreur enregistrée: ${errorType}`,
        { errorType, context, timestamp: new Date().toISOString() }
      );
    } catch (error) {
      logger.error("Erreur lors de l'enregistrement de l'erreur:", error);
    }
  }
}

// Instance singleton
const alertManager = new AlertManager();

export default alertManager;

