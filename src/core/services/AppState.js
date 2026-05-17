import StateStorage from './StateStorage.js';
import StateNotifier from './StateNotifier.js';
import StateHealthChecker from './StateHealthChecker.js';
import { startMetricsPolling, stopMetricsPolling } from './metrics.js';
import logger from '../../shared/logging/logger.js';

class AppStateService {
  #storage = new StateStorage();
  #notifier = new StateNotifier();
  #healthChecker = new StateHealthChecker(this.#storage);
  #pollingActive = false;
  #isInitialized = false;

  initialize (options = { enablePolling: true }) {
    if (this.#isInitialized) {
      logger.warn('AppState déjà initialisé');
      return;
    }

    this.#isInitialized = true;
    if (options.enablePolling) {
      startMetricsPolling(this.#storage, this.#notifier);
      this.#pollingActive = true;
    }

    logger.success('AppState service initialisé');
  }

  shutdown () {
    if (this.#pollingActive) {
      stopMetricsPolling();
      this.#pollingActive = false;
    }
    logger.info('AppState polling arrêté');
  }

  // === Getters
  get bot () { return this.#storage.getBot(); }
  get db () { return this.#storage.getDatabase(); }
  get api () { return this.#storage.getApi(); }
  get config () { return this.#storage.getConfig(); }
  get system () { return this.#storage.getSystem(); }
  get state () { return this.#storage.getFull(); }

  // === Bot State
  setBotReady (isReady) {
    this.#storage.setBotReady(isReady);
    this.#notifier.notify('bot', this.bot);
  }

  setBotConnected (isConnected) {
    this.#storage.setBotConnected(isConnected);
    this.#notifier.notify('bot', this.bot);
  }

  incrementCommandsExecuted () {
    this.#storage.incrementCommandsExecuted();
  }

  incrementCommandsFailed () {
    this.#storage.incrementCommandsFailed();
  }

  // === DB State
  setDatabaseConnected (isConnected) {
    this.#storage.setDatabaseConnected(isConnected);
    this.#notifier.notify('database', this.db);
  }

  setDatabaseHealthy (isHealthy) {
    this.#storage.setDatabaseHealthy(isHealthy);
    this.#notifier.notify('database', this.db);
  }

  incrementQueriesExecuted () {
    this.#storage.incrementQueriesExecuted();
  }

  incrementQueriesFailed () {
    this.#storage.incrementQueriesFailed();
  }

  // === API State
  setApiRunning (isRunning, port = null) {
    this.#storage.setApiRunning(isRunning, port);
    this.#notifier.notify('api', this.api);
  }

  incrementRequestsHandled () {
    this.#storage.incrementRequestsHandled();
  }

  incrementRequestsFailed () {
    this.#storage.incrementRequestsFailed();
  }

  // === Config State
  setConfigLoaded (config) {
    this.#storage.setConfigLoaded(config);
    this.#notifier.notify('config', this.config);
  }

  // === System State (auto-pollé via metrics.js)
  updateSystemMetrics () {
    this.#storage.updateSystemMetrics();
    this.#notifier.notify('system', this.system);
  }

  // === Observateurs
  onStateChange (component, callback) {
    return this.#notifier.subscribe(component, callback);
  }

  // === Health check
  isHealthy () {
    return this.#healthChecker.getStatus();
  }

  // === Reset pour tests
  _resetForTests () {
    this.#storage.reset();
    this.#notifier.reset();
    this.#isInitialized = false;
    if (this.#pollingActive) {
      stopMetricsPolling();
      this.#pollingActive = false;
    }
  }
}

export default new AppStateService();
