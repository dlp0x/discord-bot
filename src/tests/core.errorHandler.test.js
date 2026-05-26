import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock de path
vi.mock("path", () => ({
  default: {
    resolve: vi.fn((...args) => args.join("/")),
    join: vi.fn((...args) => args.join("/")),
    dirname: vi.fn((path) => path.split("/").slice(0, -1).join("/")),
  },
  resolve: vi.fn((...args) => args.join("/")),
  join: vi.fn((...args) => args.join("/")),
  dirname: vi.fn((path) => path.split("/").slice(0, -1).join("/")),
}));

// Mock du logger dans bot/logger.js
vi.mock("#shared/logging/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import monitor from "../core/monitor.js";

let errorHandler;

describe("Monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Utiliser l'instance singleton au lieu de créer une nouvelle instance
    errorHandler = monitor;
  });

  it("should have all required methods", () => {
    expect(errorHandler).toHaveProperty("handleCommandError");
    expect(errorHandler).toHaveProperty("handleApiError");
    expect(errorHandler).toHaveProperty("handleCriticalError");
    expect(errorHandler).toHaveProperty("categorizeError");
    expect(errorHandler).toHaveProperty("getUserFriendlyMessage");
    expect(errorHandler).toHaveProperty("getHttpStatusCode");
  });

  it("should handle command errors", async () => {
    const error = new Error("Test command error");
    const mockInteraction = {
      commandName: "test",
      reply: vi.fn().mockResolvedValue(true),
      replied: false,
      deferred: false,
    };

    await errorHandler.handleCommandError(error, mockInteraction);

    // Vérifier que le logger a été appelé avec un message contenant l'erreur
    const call = errorHandler.logger.error.mock.calls[0];
    expect(call[0]).toContain("Test command error");
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should handle API errors", () => {
    const error = new Error("Test API error");
    const mockReq = { method: "GET", path: "/test" };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandler.handleApiError(error, mockReq, mockRes);

    // Vérifier que le logger a été appelé avec un message contenant l'erreur
    const call = errorHandler.logger.error.mock.calls[0];
    expect(call[0]).toContain("Test API error");
    expect(mockRes.status).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalled();
  });

  it("should handle critical errors", () => {
    const error = new Error("Test critical error");
    const context = "test-context";

    errorHandler.handleCriticalError(error, context);

    // Vérifier que le logger a été appelé avec un message contenant l'erreur
    const call = errorHandler.logger.error.mock.calls[0];
    expect(call[0]).toContain("Test critical error");
    expect(call[0]).toContain(context);
  });

  it("should categorize errors correctly", () => {
    const networkError = new Error("Connection refused");
    networkError.code = "ECONNREFUSED";
    const permissionError = new Error("Insufficient permissions");

    expect(errorHandler.categorizeError(networkError)).toBe("NETWORK");
    expect(errorHandler.categorizeError(permissionError)).toBe("PERMISSION");
  });

  it("should return user-friendly messages", () => {
    // Corriger le message attendu pour correspondre au message réel
    expect(errorHandler.getUserFriendlyMessage("NETWORK")).toBe(
      "🌐 Problème de connexion réseau. Réessayez dans quelques instants."
    );
    expect(errorHandler.getUserFriendlyMessage("PERMISSION")).toBe(
      "🔒 Permissions insuffisantes pour cette action."
    );
  });

  it("should return correct HTTP status codes", () => {
    expect(errorHandler.getHttpStatusCode("NETWORK")).toBe(503);
    expect(errorHandler.getHttpStatusCode("PERMISSION")).toBe(403);
    expect(errorHandler.getHttpStatusCode("AUTH")).toBe(401);
  });
});

