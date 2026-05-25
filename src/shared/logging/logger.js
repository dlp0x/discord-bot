// ========================================
// logger.js - version simplifiée & clean
// ========================================

import chalk from 'chalk';

// =========================
// LEVELS (inchangé conceptuellement)
// =========================
const LEVELS = {
  INIT: { label: 'INIT', color: chalk.yellow },
  TRACE: { label: 'TRACE', color: chalk.gray },
  DEBUG: { label: 'DEBUG', color: chalk.magenta },
  INFO: { label: 'INFO', color: chalk.cyan },
  WARN: { label: 'WARN', color: chalk.yellowBright },
  ERROR: { label: 'ERROR', color: chalk.redBright.bold },
  SUCCESS: { label: 'OK', color: chalk.greenBright },
  UPDATE: { label: 'UPD', color: chalk.gray },

  CMD: { label: 'CMD', color: chalk.blueBright },
  EVENT: { label: 'EVT', color: chalk.magentaBright },
  API: { label: 'API', color: chalk.cyanBright },
  BOT: { label: 'BOT', color: chalk.blueBright },
  TASK: { label: 'TASK', color: chalk.yellowBright }
};

// =========================
// LOGGER CORE
// =========================
class Logger {
  constructor () {
    this.metrics = {
      total: 0,
      byLevel: {}
    };
  }

  // =========================
  // CORE WRITE
  // =========================
  log (level, ...args) {
    const def = LEVELS[level] || LEVELS.INFO;
    const timestamp = new Date().toISOString();

    const message = args.map(this.format).join(' ');
    const line = `${chalk.gray(`[${timestamp}]`)} ${def.color(`[${def.label}]`)} ${message}`;

    process.stdout.write(line + '\n');

    this.track(level);
  }

  // =========================
  // FORMAT SAFE
  // =========================
  format (arg) {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return '[object]';
      }
    }
    return String(arg);
  }

  // =========================
  // METRICS
  // =========================
  track (level) {
    this.metrics.total++;
    this.metrics.byLevel[level] = (this.metrics.byLevel[level] || 0) + 1;
  }

  getMetrics () {
    return this.metrics;
  }

  // =========================
  // SIMPLE API (clean)
  // =========================
  init (...a) { this.log('INIT', ...a); }
  trace (...a) { this.log('TRACE', ...a); }
  debug (...a) { this.log('DEBUG', ...a); }
  info (...a) { this.log('INFO', ...a); }
  warn (...a) { this.log('WARN', ...a); }
  error (...a) { this.log('ERROR', ...a); }
  success (...a) { this.log('SUCCESS', ...a); }
  update (...a) { this.log('UPDATE', ...a); }
  
  // =========================
  // DOMAIN LOGS
  // =========================
  cmd (...a) { this.log('CMD', ...a); }
  event (...a) { this.log('EVENT', ...a); }
  api (...a) { this.log('API', ...a); }
  bot (...a) { this.log('BOT', ...a); }
  task (...a) { this.log('TASK', ...a); }

  // =========================
  // SECTIONS (UI uniquement)
  // =========================
  section (title) {
    const line = '━'.repeat(50);
    process.stdout.write(`\n${chalk.cyan(line)}\n${chalk.bold(title)}\n${chalk.cyan(line)}\n\n`);
  }

  banner (title) {
    const line = '━'.repeat(50);
    process.stdout.write(`\n${chalk.magenta(line)}\n${chalk.bold(title)}\n${chalk.magenta(line)}\n\n`);
  }
}

// singleton
export default new Logger();