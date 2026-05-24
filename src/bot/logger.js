import chalk from 'chalk';

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

class Logger {
  constructor () {
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

  track (level, elapsedMs) {
    this.metrics.totalLogs += 1;
    this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;

    this.metrics.performance.writeCount += 1;
    this.metrics.performance.totalWriteTime += elapsedMs;
    this.metrics.performance.avgWriteTime = this.metrics.performance.totalWriteTime / this.metrics.performance.writeCount;
  }

  log (level, ...args) {
    const start = Date.now();
    const def = LEVELS[level] || LEVELS.INFO;
    const timestamp = new Date().toISOString();
    const message = args.map((a) => this.format(a)).join(' ');
    const line = `${chalk.gray(`[${timestamp}]`)} ${def.color(`[${def.label}]`)} ${message}`;

    process.stdout.write(line + '\n');

    const elapsed = Math.max(1, Date.now() - start);
    this.track(level, elapsed);
  }

  getMetrics () {
    return this.metrics;
  }

  init (...a) { this.log('INIT', ...a); }
  trace (...a) { this.log('TRACE', ...a); }
  debug (...a) { this.log('DEBUG', ...a); }
  info (...a) { this.log('INFO', ...a); }
  warn (...a) { this.log('WARN', ...a); }
  error (...a) { this.log('ERROR', ...a); }
  success (...a) { this.log('SUCCESS', ...a); }
  update (...a) { this.log('UPDATE', ...a); }

  cmd (...a) { this.log('CMD', ...a); }
  event (...a) { this.log('EVENT', ...a); }
  api (...a) { this.log('API', ...a); }
  bot (...a) { this.log('BOT', ...a); }
  task (...a) { this.log('TASK', ...a); }

  // Legacy aliases expected by tests
  infomd (...a) { this.cmd(...a); }
  infoommand (...a) { this.cmd(...a); }
  sectionStart (...a) { this.section(...a); }
  summary (...a) { this.section(...a); }
  infoSync (...a) { this.info(...a); }
  warnSync (...a) { this.warn(...a); }
  errorSync (...a) { this.error(...a); }

  section (title) {
    const line = '-'.repeat(50);
    process.stdout.write(`\n${line}\n${title}\n${line}\n\n`);
  }

  banner (title) {
    const line = '='.repeat(50);
    process.stdout.write(`\n${line}\n${title}\n${line}\n\n`);
  }
}

export default new Logger();
