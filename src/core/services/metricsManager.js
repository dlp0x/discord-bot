// core/services/metrics.js

let intervalId = null;

/**
 * Récupère les métriques mémoire + CPU (basique)
 * @returns {{memoryUsage: object, cpuUsage: object}}
 */
export function getSystemMetrics () {
  const memUsage = process.memoryUsage();
  // cpuUsage, on prend l’instantané depuis process.cpuUsage (en microsecondes)
  const cpu = process.cpuUsage();

  return {
    memoryUsage: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024)
    },
    cpuUsage: {
      userMS: cpu.user / 1000,
      systemMS: cpu.system / 1000
    }
  };
}

/**
 * Démarre le polling des métriques système
 * @param {StateStorage} storage Instance de StateStorage
 * @param {StateNotifier} notifier Instance de StateNotifier
 * @param {number} interval ms entre chaque update, default 30000 (30s)
 */
export function startMetricsPolling (storage, notifier, interval = 30000) {
  if (intervalId) return; // déjà lancé

  function update () {
    const metrics = getSystemMetrics();
    storage.updateSystemMetrics(metrics);
    notifier.notify('system', storage.getSystem());
  }

  update(); // premier appel direct
  intervalId = setInterval(update, interval);
}

/**
 * Arrête le polling des métriques
 */
export function stopMetricsPolling () {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}
