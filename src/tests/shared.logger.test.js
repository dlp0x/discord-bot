// tests/logger.test.js
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import logger from '#shared/logging/logger.js';

describe('PerformanceLogger', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.metrics.totalLogs = 0;
    logger.metrics.logsByLevel = {};
    logger.metrics.performance = {
      totalWriteTime: 0,
      writeCount: 0,
      avgWriteTime: 0
    };
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('should log an info message', async () => {
    await logger.info('Ceci est un log info');
    expect(stdoutSpy).toHaveBeenCalled();
    expect(logger.metrics.totalLogs).toBe(1);
    expect(logger.metrics.logsByLevel.INFO).toBe(1);
  });

  it('should log an error message', async () => {
    await logger.error('Une erreur est survenue');
    expect(stdoutSpy).toHaveBeenCalled();
    expect(logger.metrics.logsByLevel.ERROR).toBe(1);
  });

  it('should track performance metrics', async () => {
    await logger.warn('Test performance');
    expect(logger.metrics.performance.writeCount).toBe(1);
    expect(logger.metrics.performance.totalWriteTime).toBeGreaterThan(0);
    expect(logger.metrics.performance.avgWriteTime).toBeGreaterThan(0);
  });

  it('should handle custom levels like CMD and INIT', async () => {
    await logger.infoommand('Commande exécutée');
    await logger.init('Initialisation en cours');
    expect(logger.metrics.logsByLevel.CMD).toBe(1);
    expect(logger.metrics.logsByLevel.INIT).toBe(1);
  });

  it('should stringify objects properly', async () => {
    const obj = { foo: 'bar', num: 42 };
    await logger.debug('Objet:', obj);
    const written = stdoutSpy.mock.calls[0][0];
    expect(written).toContain('foo');
    expect(written).toContain('bar');
  });

  it('should not crash on circular references', async () => {
    const a = {}; a.self = a;
    await logger.info('Test circulaire', a);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should have working section methods', () => {
    logger.banner('TEST BANNER');
    logger.section('TEST SECTION');
    logger.sectionStart('TEST START');
    logger.summary('TEST SUMMARY');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should support synchronous methods', () => {
    logger.infoSync('sync info');
    logger.warnSync('sync warn');
    logger.errorSync('sync error');
    expect(stdoutSpy).toHaveBeenCalled();
  });
});
