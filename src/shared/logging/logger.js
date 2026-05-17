
// ========================================
// bot/logger.js - Logger personnalisé pour le bot Discord
// ========================================

import chalk from 'chalk';

const LEVELS = {
  IGNR: { label: '↳',  color: chalk.gray, priority: 0 },
  TRACE: { label: 'TRACE',  color: chalk.gray, priority: 1 },
  DEBUG: { label: 'DEBUG',  color: chalk.magenta, priority: 2 },
  INFO: { label: 'INFO',   color: chalk.cyan, priority: 3 },
  WARN: { label: 'WARN',   color: chalk.yellowBright, priority: 4 },
  ERROR: { label: 'ERROR',  color: chalk.redBright.bold, priority: 5 },
  SUCCESS: { label: '✓ OK',   color: chalk.greenBright, priority: 6 },

  CMD: { label: 'CMD',    color: chalk.blueBright, priority: 7 },
  EVENT: { label: 'EVT',    color: chalk.magentaBright, priority: 8 },
  API: { label: 'API',    color: chalk.cyanBright, priority: 9 },
  BOT: { label: 'BOT',    color: chalk.greenBright, priority: 10 },
  TASK: { label: 'TASK',   color: chalk.yellowBright, priority: 11 },
  INIT: { label: 'INIT',   color: chalk.hex('#FFA500'), priority: 12 },
  UPDATE: { label: 'UPD',    color: chalk.hex('#FFFFFF'), priority: 13 }
};

class PerformanceLogger {
  constructor () {
    this.logs = [];
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      performance: {
        totalWriteTime: 0,
        writeCount: 0,
        avgWriteTime: 0
      }
    };
  }

  formatArg (arg) {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return '[Unstringifiable Object]';
      }
    }
    return String(arg);
  }

  async write (level, ...args) {
    const start = performance.now();
    const timestamp = new Date().toISOString();
    const levelInfo = LEVELS[level] || LEVELS.INFO;
    const tag = levelInfo.color(`[${levelInfo.label}]`);
    const line = `${chalk.gray(`[${timestamp}]`)} ${tag} ${args.map(this.formatArg).join(' ')}`;

    process.stdout.write(`${line}
`);

    // Metrics tracking
    const duration = performance.now() - start;
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;
    this.metrics.performance.writeCount++;
    this.metrics.performance.totalWriteTime += duration;
    this.metrics.performance.avgWriteTime
      = this.metrics.performance.totalWriteTime / this.metrics.performance.writeCount;
  }

  getMetrics () {
    return this.metrics;
  }

  // Méthodes par niveau
  none = (...args) => this.write('', ...args);
  trace = (...args) => this.write('TRACE', ...args);
  debug = (...args) => this.write('DEBUG', ...args);
  info = (...args) => this.write('INFO', ...args);
  warn = (...args) => this.write('WARN', ...args);
  error = (...args) => this.write('ERROR', ...args);
  success = (...args) => this.write('SUCCESS', ...args);

  // Méthodes personnalisées
  custom = (...args) => this.write(...args);
  command = (...args) => this.custom('CMD', ...args);
  event = (...args) => this.custom('EVENT', ...args);
  api = (...args) => this.custom('API', ...args);
  bot = (...args) => this.custom('BOT', ...args);
  task = (...args) => this.custom('TASK', ...args);
  init = (...args) => this.custom('INIT', ...args);
  update = (...args) => this.custom('UPDATE', ...args);

  // Méthodes de section pour mise en forme
  banner = (title) => {
    const line = '━'.repeat(60);
    process.stdout.write(`\n${chalk.magenta(line)}\n${chalk.bold(`  ${title}  `)}\n${chalk.magenta(line)}\n\n`);
  };

  section = (title) => {
    const line = '━'.repeat(60);
    process.stdout.write(`\n${chalk.yellow(line)}\n${chalk.bold(`  ${title}  `)}\n${chalk.yellow(line)}\n\n`);
  };

  sectionStart = (title) => {
    const line = `${'━'.repeat(57)}`;
    process.stdout.write(`\n${chalk.cyan(line)}\n${chalk.bold(`  ${title}  `)}\n${chalk.cyan(line)}\n`);
  };

  summary = (title) => {
    const line = `┗${'━'.repeat(57)}`;
    process.stdout.write(`\n${chalk.green(line)}\n${chalk.bold(`  ${title}  `)}\n${chalk.green(line)}\n`);
  };

  // Méthodes synchrones (fallbacks)
  errorSync (msg) {
    process.stdout.write(`[ERROR] ${msg}\n`);
  }

  warnSync (msg) {
    process.stdout.write(`[WARN] ${msg}\n`);
  }

  infoSync (msg) {
    process.stdout.write(`[INFO] ${msg}\n`);
  }
}

export default new PerformanceLogger();
