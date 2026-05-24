// ========================================
// bot/config.js (ESM) - Configuration canonique du bot avec validation Zod
// ========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import logger from '#shared/logging/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const initialEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile (filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const parsed = dotenv.parse(fs.readFileSync(filePath));

  for (const [key, value] of Object.entries(parsed)) {
    if (!initialEnvKeys.has(key) || typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

function normalizeNodeEnv (value) {
  const raw = typeof value === 'string' && value !== '' ? value : 'dev';

  if (raw === 'development') return 'dev';
  if (raw === 'production') return 'prod';

  return raw;
}

function optionalStringSchema () {
  return z.preprocess((value) => {
    if (typeof value === 'undefined' || value === null || value === '') {
      return undefined;
    }

    return String(value);
  }, z.string().optional());
}

function optionalUrlSchema () {
  return z.preprocess((value) => {
    if (typeof value === 'undefined' || value === null || value === '') {
      return undefined;
    }

    const stringValue = String(value);

    try {
      new URL(stringValue);
      return stringValue;
    } catch {
      return undefined;
    }
  }, z.string().optional());
}

function numericStringWithDefault (defaultValue) {
  return z.preprocess((value) => {
    if (typeof value === 'undefined' || value === null || value === '') {
      return defaultValue;
    }

    const stringValue = String(value);
    return (/^\d+$/).test(stringValue) ? stringValue : defaultValue;
  }, z.string().regex(/^\d+$/));
}

function booleanFlagWithDefault (defaultValue) {
  return z.preprocess((value) => {
    if (typeof value === 'undefined' || value === null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return String(value).toLowerCase() !== 'false';
  }, z.boolean());
}

const envFileEnv = normalizeNodeEnv(process.env.NODE_ENV);
const baseEnvPath = path.join(__dirname, '../.env');
const envSpecificPath = path.join(__dirname, `../.env.${envFileEnv}`);

loadEnvFile(baseEnvPath);
loadEnvFile(envSpecificPath);

const envSchema = z.object({
  NODE_ENV: z
    .preprocess((value) => normalizeNodeEnv(value), z.enum(['dev', 'test', 'staging', 'prod']))
    .default('dev'),
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN est requis'),
  ADMIN_ROLE_ID: z.string().min(1, 'ADMIN_ROLE_ID est requis'),
  PLAYLIST_CHANNEL_ID: z.string().min(1, 'PLAYLIST_CHANNEL_ID est requis'),
  VOICE_CHANNEL_ID: z.string().min(1, 'VOICE_CHANNEL_ID est requis'),
  BOT_ROLE_NAME: z.string().default('soundSHINE'),
  DEV_GUILD_ID: optionalStringSchema(),
  CLIENT_ID: optionalStringSchema(),
  GUILD_ID: optionalStringSchema(),
  BOT_TOKEN: optionalStringSchema(),
  UNSPLASH_ACCESS_KEY: optionalStringSchema(),
  STREAM_URL: optionalUrlSchema(),
  JSON_URL: optionalUrlSchema(),
  RADIODJ_API_URL: optionalUrlSchema(),
  RADIODJ_API_KEY: optionalStringSchema(),
  API_TOKEN: optionalStringSchema(),
  API_PORT: numericStringWithDefault('3000').default('3000'),
  LOG_LEVEL: z
    .preprocess((value) => {
      if (typeof value === 'undefined' || value === null || value === '') {
        return 'info';
      }

      return String(value).toLowerCase();
    }, z.enum(['error', 'warn', 'info', 'debug']))
    .default('info'),
  REQ_ROLE_ID: optionalStringSchema(),
  REQ_CHANNEL_ID: optionalStringSchema(),
  DB_PATH: optionalStringSchema(),
  CORS_ORIGIN: optionalStringSchema(),
  RATE_LIMIT_WINDOW: numericStringWithDefault('900000').default('900000'),
  RATE_LIMIT_MAX: numericStringWithDefault('100').default('100'),
  ENABLE_METRICS: booleanFlagWithDefault(true).default(true),
  ENABLE_HEALTH_CHECK: booleanFlagWithDefault(true).default(true),
  CACHE_TTL: numericStringWithDefault('300000').default('300000'),
  CACHE_MAX_SIZE: numericStringWithDefault('1000').default('1000'),
  SILENCE_THRESHOLD: numericStringWithDefault('5000').default('5000'),
  SILENCE_CHECK_INTERVAL: numericStringWithDefault('10000').default('10000'),
  SILENCE_ALERTS_ENABLED: booleanFlagWithDefault(true).default(true),
  SILENCE_ALERT_CHANNEL_ID: optionalStringSchema(),
  ADMIN_USER_ID: optionalStringSchema()
});

function buildConfig () {
  const parsedEnv = envSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    parsedEnv.error.issues.forEach((issue) => {
      logger.error(`Configuration invalide pour ${issue.path.join('.')}: ${issue.message}`);
    });

    throw new Error(`Configuration invalide: ${parsedEnv.error.issues.length} erreur(s) de validation`);
  }

  const env = parsedEnv.data;
  const config = {
    NODE_ENV: env.NODE_ENV,
    isDev: env.NODE_ENV === 'dev',
    isStaging: env.NODE_ENV === 'staging',
    isProd: env.NODE_ENV === 'prod',
    isTest: env.NODE_ENV === 'test',

    DISCORD_TOKEN: env.DISCORD_TOKEN,
    BOT_TOKEN: env.BOT_TOKEN || env.DISCORD_TOKEN,
    ADMIN_ROLE_ID: env.ADMIN_ROLE_ID,
    PLAYLIST_CHANNEL_ID: env.PLAYLIST_CHANNEL_ID,
    VOICE_CHANNEL_ID: env.VOICE_CHANNEL_ID,
    BOT_ROLE_NAME: env.BOT_ROLE_NAME,
    DEV_GUILD_ID: env.DEV_GUILD_ID,
    CLIENT_ID: env.CLIENT_ID,
    GUILD_ID: env.GUILD_ID,

    UNSPLASH_ACCESS_KEY: env.UNSPLASH_ACCESS_KEY,
    STREAM_URL: env.STREAM_URL,
    JSON_URL: env.JSON_URL,
    RADIODJ_API_URL: env.RADIODJ_API_URL,
    RADIODJ_API_KEY: env.RADIODJ_API_KEY,

    API_TOKEN: env.API_TOKEN,
    API_PORT: env.API_PORT,
    LOG_LEVEL: env.LOG_LEVEL,

    REQ_ROLE_ID: env.REQ_ROLE_ID,
    REQ_CHANNEL_ID: env.REQ_CHANNEL_ID,
    reqRoleId: env.REQ_ROLE_ID,
    reqChannelId: env.REQ_CHANNEL_ID,

    DB_PATH: env.DB_PATH,
    CORS_ORIGIN: env.CORS_ORIGIN,
    RATE_LIMIT_WINDOW: env.RATE_LIMIT_WINDOW,
    RATE_LIMIT_MAX: env.RATE_LIMIT_MAX,
    ENABLE_METRICS: env.ENABLE_METRICS,
    ENABLE_HEALTH_CHECK: env.ENABLE_HEALTH_CHECK,
    CACHE_TTL: env.CACHE_TTL,
    CACHE_MAX_SIZE: env.CACHE_MAX_SIZE,
    SILENCE_THRESHOLD: env.SILENCE_THRESHOLD,
    SILENCE_CHECK_INTERVAL: env.SILENCE_CHECK_INTERVAL,
    SILENCE_ALERTS_ENABLED: env.SILENCE_ALERTS_ENABLED,
    SILENCE_ALERT_CHANNEL_ID: env.SILENCE_ALERT_CHANNEL_ID,
    ADMIN_USER_ID: env.ADMIN_USER_ID,

    dbPath: env.DB_PATH || path.join(__dirname, '../data/soundshine.sqlite'),
    logsPath: path.join(__dirname, '../data/logs'),
    security: {
      corsOrigin: env.CORS_ORIGIN || '*',
      rateLimit: {
        windowMs: Number(env.RATE_LIMIT_WINDOW),
        max: Number(env.RATE_LIMIT_MAX)
      }
    },
    cache: {
      ttl: Number(env.CACHE_TTL),
      maxSize: Number(env.CACHE_MAX_SIZE)
    },
    monitoring: {
      enableMetrics: env.ENABLE_METRICS,
      enableHealthCheck: env.ENABLE_HEALTH_CHECK
    },
    discord: {
      token: env.DISCORD_TOKEN,
      clientId: env.CLIENT_ID,
      guildId: env.GUILD_ID,
      devGuildId: env.DEV_GUILD_ID,
      adminRoleId: env.ADMIN_ROLE_ID,
      voiceChannelId: env.VOICE_CHANNEL_ID,
      playlistChannelId: env.PLAYLIST_CHANNEL_ID,
      botRoleName: env.BOT_ROLE_NAME
    },
    api: {
      port: Number(env.API_PORT),
      token: env.API_TOKEN,
      unsplashKey: env.UNSPLASH_ACCESS_KEY,
      streamUrl: env.STREAM_URL,
      jsonUrl: env.JSON_URL,
      radioDjUrl: env.RADIODJ_API_URL,
      radioDjKey: env.RADIODJ_API_KEY
    },

    hasUnsplash () {
      return !!this.UNSPLASH_ACCESS_KEY;
    },

    hasStreamService () {
      return !!(this.STREAM_URL && this.JSON_URL);
    },

    validateServices () {
      const services = {
        unsplash: this.hasUnsplash(),
        streaming: this.hasStreamService()
      };

      logger.banner('État des services :');
      logger.info(`Unsplash: ${services.unsplash ? 'Configuré' : 'Non configuré'}`);
      logger.info(`Streaming: ${services.streaming ? 'Configuré' : 'Non configuré'}`);

      return services;
    }
  };

  const missingOptionalVars = [
    'UNSPLASH_ACCESS_KEY',
    'STREAM_URL',
    'JSON_URL',
    'RADIODJ_API_URL',
    'RADIODJ_API_KEY'
  ].filter((key) => !config[key]);

  if (missingOptionalVars.length > 0 && config.NODE_ENV !== 'test') {
    logger.warn(`Variables d'environnement optionnelles manquantes : ${missingOptionalVars.join(', ')}`);
    logger.warn('Certaines fonctionnalités pourraient être désactivées.');
  }

  return config;
}

const config = buildConfig();

if (config.NODE_ENV !== 'test') {
  config.validateServices();
}

export default config;
