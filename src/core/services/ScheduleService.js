// ========================================
// core/services/ScheduleService.js - Service de gestion des horaires
// ========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '#shared/logging/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ScheduleService {
  constructor () {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
    this.schedulePath = path.join(__dirname, '../../data/schedule.json');
  }

  /**
   * Charger le schedule depuis le fichier JSON
   */
  async loadSchedule () {
    try {
      // Vérifier si le cache est encore valide
      const now = Date.now();
      if (
        this.cache.has('schedule')
        && now - this.lastCacheUpdate < this.cacheTimeout
      ) {
        logger.debug('Utilisation du cache pour le schedule');
        return this.cache.get('schedule');
      }

      // Lire le fichier JSON
      if (!fs.existsSync(this.schedulePath)) {
        logger.error('Fichier schedule.txt introuvable');
        return this.getDefaultSchedule();
      }

      const scheduleData = fs.readFileSync(this.schedulePath, 'utf-8');
      let schedule;
try {
  schedule = JSON.parse(scheduleData);
} catch (error) {
  logger.error('Schedule JSON invalide:', error);
  return this.getDefaultSchedule();
}
      

      // Validation basique
      if (
        !schedule.schedules
        || !schedule.schedules.fr
        || !schedule.schedules.en
      ) {
        logger.error('Structure du schedule invalide');
        return this.getDefaultSchedule();
      }

      // Mettre en cache
      this.cache.set('schedule', schedule);
      this.lastCacheUpdate = now;

      logger.info('Schedule chargé avec succès');
      return schedule;
    } catch (error) {
      logger.error('Erreur lors du chargement du schedule:', error);
      return this.getDefaultSchedule();
    }
  }

  /**
   * Obtenir le schedule pour une langue spécifique
   */
  async getSchedule (language = 'fr') {
    try {
      const schedule = await this.loadSchedule();
      const langSchedule = schedule.schedules[language];
      console.log('language:', language);
console.log('langSchedule:', langSchedule);

      if (!langSchedule) {
        logger.warn(
          `Langue non supportée: ${language}, utilisation du français par défaut`
        );
        return schedule.schedules.fr;
      }

      return langSchedule;
    } catch (error) {
      logger.error(
        `Erreur lors de la récupération du schedule pour ${language}:`,
        error
      );
      return this.getDefaultSchedule().schedules.fr;
    }
  }

  /**
   * Obtenir le contenu formaté pour Discord
   */
  async getFormattedSchedule (language = 'fr') {
    try {
      const schedule = await this.getSchedule(language);
      return {
        title: schedule.title,
        description: schedule.description,
        content: schedule.content.join('\n')
      };
    } catch (error) {
      logger.error(
        `Erreur lors du formatage du schedule pour ${language}:`,
        error
      );
      return {
        title:
          language === 'fr'
            ? 'Horaire (Version Française)'
            : 'Schedule (English version)',
        description:
          language === 'fr' ? 'Programme de la semaine' : 'Weekly program',
        content:
          language === 'fr'
            ? 'Aucune donnée disponible.'
            : 'No data available.'
      };
    }
  }

  /**
   * Vider le cache
   */
  clearCache () {
    this.cache.clear();
    this.lastCacheUpdate = 0;
    logger.info('Cache du schedule vidé');
  }

  /**
   * Mettre à jour le schedule
   */
  async updateSchedule (newSchedule) {
    try {
      // Validation
      if (
        !newSchedule.schedules
        || !newSchedule.schedules.fr
        || !newSchedule.schedules.en
      ) {
        throw new Error('Structure du schedule invalide');
      }

      // Ajouter métadonnées
      const scheduleToSave = {
        version: newSchedule.version || '1.0',
        lastUpdated: new Date().toISOString(),
        schedules: newSchedule.schedules
      };

      // Sauvegarder
      fs.writeFileSync(
        this.schedulePath,
        JSON.stringify(scheduleToSave, null, 2)
      );

      // Vider le cache
      this.clearCache();

      logger.info('Schedule mis à jour avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du schedule:', error);
      return false;
    }
  }

  /**
   * Schedule par défaut en cas d'erreur
   */
  getDefaultSchedule () {
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      schedules: {
        fr: {
          title: 'Horaire (Version Française)',
          description: 'Programme de la semaine',
          content: ['Aucune donnée disponible.']
        },
        en: {
          title: 'Schedule (English version)',
          description: 'Weekly program',
          content: ['No data available.']
        }
      }
    };
  }

  /**
   * Vérifier l'état du service
   */
  async getStatus () {
    try {
      const exists = fs.existsSync(this.schedulePath);
      const schedule = await this.loadSchedule();

      return {
        fileExists: exists,
        cacheValid: this.cache.has('schedule'),
        lastUpdate: this.lastCacheUpdate,
        hasData: !!(schedule.schedules?.fr && schedule.schedules?.en),
        version: schedule.version
      };
    } catch (error) {
      logger.error('Erreur lors de la vérification du statut:', error);
      return {
        fileExists: false,
        cacheValid: false,
        lastUpdate: 0,
        hasData: false,
        version: 'unknown'
      };
    }
  }
}

// Instance singleton
const scheduleService = new ScheduleService();

export default scheduleService;
