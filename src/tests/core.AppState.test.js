import { describe, it, expect, beforeEach, vi } from "vitest";
import appState from "../core/services/AppState.js";

// Mock du logger pour éviter les effets de bord
vi.mock("#shared/logging/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

describe("AppState", () => {
  beforeEach(() => {
    // Reset l'état entre chaque test
    appState._resetForTests();
  });

  it("getBotState() retourne l'état initial", () => {
    const bot = appState.bot;
    expect(bot.isReady).toBe(false);
    expect(bot.isConnected).toBe(false);
    expect(bot.commandsExecuted).toBe(0);
    expect(bot.commandsFailed).toBe(0);
  });

  it("setBotReady(true) met à jour l'état", () => {
    appState.setBotReady(true);
    const bot = appState.bot;
    expect(bot.isReady).toBe(true);
    expect(typeof bot.startTime).toBe("number");
  });

  it("setBotConnected(true) met à jour l'état", () => {
    appState.setBotConnected(true);
    const bot = appState.bot;
    expect(bot.isConnected).toBe(true);
  });

  it("incrementCommandsExecuted() incrémente le compteur", () => {
    appState.incrementCommandsExecuted();
    const bot = appState.bot;
    expect(bot.commandsExecuted).toBe(1);
  });

  it("incrementCommandsFailed() incrémente le compteur", () => {
    appState.incrementCommandsFailed();
    const bot = appState.bot;
    expect(bot.commandsFailed).toBe(1);
  });

  it("setDatabaseConnected(true) met à jour l'état", () => {
    appState.setDatabaseConnected(true);
    const db = appState.db;
    expect(db.isConnected).toBe(true);
    expect(typeof db.lastCheck).toBe("number");
  });

  it("setDatabaseHealthy(true) met à jour l'état", () => {
    appState.setDatabaseHealthy(true);
    const db = appState.db;
    expect(db.isHealthy).toBe(true);
    expect(typeof db.lastCheck).toBe("number");
  });

  it("isHealthy() retourne false si rien n'est prêt", () => {
    const health = appState.isHealthy();
    expect(health.overall).toBe(false);
  });

  it("isHealthy() retourne true si tout est prêt", () => {
    appState.setBotReady(true);
    appState.setBotConnected(true);
    appState.setDatabaseConnected(true);
    appState.setDatabaseHealthy(true);
    appState.setApiRunning(true, 3000);
    appState.setConfigLoaded({ NODE_ENV: "test" });
    const health = appState.isHealthy();
    expect(health.overall).toBe(true);
  });

  it("resetForTests() réinitialise tout", () => {
    appState.setBotReady(true);
    appState.setDatabaseConnected(true);
    appState._resetForTests();
    const bot = appState.bot;
    const db = appState.db;
    expect(bot.isReady).toBe(false);
    expect(db.isConnected).toBe(false);
  });
});
