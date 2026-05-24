#!/usr/bin/env node

// ========================================
// tests/security.test.js - Tests de sécurité complets et fonctionnels
// ========================================

import { vi } from "vitest";

// Mock de path avant les imports
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

import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config } from "dotenv";

// Configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// Charger les variables d'environnement
config({ path: resolve(projectRoot, ".env") });

// Importer les modules de sécurité
import validator from "#shared/validation/validation.js";
import rateLimiter from "#core/services/rateLimiter.js";
import { secureLogger } from "#shared/logging/secureLogger.js";
import { xssProtection } from "../core/middleware/security.js";

describe("Security Tests", () => {
  beforeEach(() => {
    // Réinitialiser le rate limiter avant chaque test
    rateLimiter.reset();
  });

  describe("Input Validation", () => {
    it("should validate valid suggestion", () => {
      const result = validator.validateSuggestion(
        "Une excellente suggestion pour améliorer le bot"
      );
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("should reject short suggestion", () => {
      expect(() => {
        validator.validateSuggestion("ab");
      }).toThrow("3 caractères");
    });

    it("should reject forbidden content", () => {
      expect(() => {
        validator.validateSuggestion("Cette suggestion contient le mot spam");
      }).toThrow("contenu interdit");
    });

    it("should validate valid Discord ID", () => {
      const result = validator.validateDiscordId("123456789012345678");
      expect(result).toBe("123456789012345678");
    });

    it("should reject invalid Discord ID", () => {
      expect(() => {
        validator.validateDiscordId("invalid");
      }).toThrow("invalide");
    });

    it("should sanitize HTML in strings", () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = validator.sanitizeString(input, { escapeHtml: true });
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
    });

    it("should detect dangerous inline HTML handlers", () => {
      expect(validator.containsDangerousHtml('<img src="x" onerror="alert(1)">')).toBe(true);
      expect(validator.containsDangerousHtml("Bonjour tout le monde")).toBe(false);
    });

    it("should validate valid URL", () => {
      const result = validator.validateUrl("https://discord.com/api/v10");
      expect(result).toBe("https://discord.com/api/v10");
    });

    it("should reject invalid URL", () => {
      expect(() => {
        validator.validateUrl("not-a-url");
      }).toThrow("invalide");
    });
  });

  describe("Rate Limiting", () => {
    it("should allow first request", () => {
      const userId = "test-user-1";
      const result = rateLimiter.canExecute(userId, "general");
      expect(result.allowed).toBe(true);
    });

    it("should block when limit exceeded", () => {
      const userId = "test-user-2";

      // Exécuter plus de requêtes que la limite
      for (let i = 0; i < 15; i++) {
        rateLimiter.canExecute(userId, "general");
      }

      const result = rateLimiter.canExecute(userId, "general");
      expect(result.allowed).toBe(false);
      // L'utilisateur est maintenant bloqué, donc la raison est USER_BLOCKED
      expect(result.reason).toBe("USER_BLOCKED");
    });

    it("should unblock user", () => {
      const userId = "test-user-3";

      // Bloquer l'utilisateur
      for (let i = 0; i < 15; i++) {
        rateLimiter.canExecute(userId, "general");
      }

      // Vérifier qu'il est bloqué
      expect(rateLimiter.isBlocked(userId, "general")).toBe(true);

      // Débloquer
      const unblocked = rateLimiter.unblockUser(userId, "general");
      expect(unblocked).toBe(true);

      // Vérifier qu'il n'est plus bloqué
      expect(rateLimiter.isBlocked(userId, "general")).toBe(false);
    });

    it("should return valid stats", () => {
      const stats = rateLimiter.getStats();
      expect(typeof stats.totalWindows).toBe("number");
    });
  });

  describe("Secure Logging", () => {
    it("should mask unknown tokens", () => {
      const message = "Token: FAKE_TEST_TOKEN_123456789_ABCDEFGHIJKLMNOP";
      const masked = secureLogger.maskSensitiveData(message);

      expect(masked).not.toContain(
        "FAKE_TEST_TOKEN_123456789_ABCDEFGHIJKLMNOP"
      );
    });

    it("should mask Discord IDs", () => {
      const message = "User ID: 123456789012345678";
      // Test avec masquage
      const masked = secureLogger.maskSensitiveData(message, "high", {
        maskIds: true,
      });
      expect(masked).not.toContain("123456789012345678");
      expect(masked).toContain("[DISCORD_ID]");
      // Test sans masquage
      const unmasked = secureLogger.maskSensitiveData(message, "high", {
        maskIds: false,
      });
      expect(unmasked).toContain("123456789012345678");
    });

    it("should mask emails in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const message = "Email: test@example.com";
      const masked = secureLogger.maskSensitiveData(message, "high", {
        maskEmails: true,
      });

      expect(masked).toContain("[EMAIL_MASQUÉ]");

      // Restaurer l'environnement
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("File Validation", () => {
    it("should validate safe filenames", () => {
      const validFiles = [
        "image.jpg",
        "document.pdf",
        "audio.mp3",
        "video.mp4",
        "archive.zip",
      ];

      validFiles.forEach((filename) => {
        expect(() => {
          validator.validateFilename(filename);
        }).not.toThrow();
      });
    });

    it("should reject dangerous filenames", () => {
      const invalidFiles = [
        "script.exe",
        "malware.bat",
        "virus.js",
        "hack.vbs",
        "exploit.com",
      ];

      invalidFiles.forEach((filename) => {
        expect(() => {
          validator.validateFilename(filename);
        }).toThrow();
      });
    });
  });

  describe("Integration Tests", () => {
    it("should integrate validation and rate limiting", () => {
      const userId = "integration-test";
      const suggestion = "Test suggestion";

      // Vérifier rate limit
      const rateResult = rateLimiter.canExecute(userId, "suggestion");
      expect(rateResult.allowed).toBe(true);

      // Valider suggestion
      const validated = validator.validateSuggestion(suggestion);
      expect(validated).toBeTruthy();

      // Logger sécurisé
      expect(() => {
        secureLogger.secureLog("info", `Suggestion validée: ${suggestion}`, {
          userId,
        });
      }).not.toThrow();
    });

    it("should block XSS payloads in middleware", () => {
      const req = {
        body: { content: '<script>alert("xss")</script>' },
        query: {},
        params: {},
        url: "/test",
        method: "POST",
        ip: "127.0.0.1",
        get: vi.fn(() => "vitest"),
      };
      const res = {
        set: vi.fn(),
        status: vi.fn(() => ({
          json: vi.fn((payload) => payload),
        })),
      };
      const next = vi.fn();

      xssProtection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("should integrate logging and masking", () => {
      const userId = "123456789012345678";
      const sensitiveData = {
        token: "FAKE_TEST_TOKEN_123456789_ABCDEFGHIJKLMNOP",
        email: "test@example.com",
        userId: userId,
      };

      // Logger avec masquage
      expect(() => {
        secureLogger.secureLog(
          "info",
          "Test avec données sensibles",
          sensitiveData,
          {
            maskIds: true,
            maskTokens: true,
          }
        );
      }).not.toThrow();

      // Vérifier que les données sont masquées dans l'objet
      const maskedData = secureLogger.maskObject(sensitiveData, "high", {
        maskIds: true,
        maskTokens: true,
      });

      // Vérifier que le token est masqué (car pas dans .env)
      expect(maskedData.token).toBe("[TOKEN_MASQUÉ]");

      // Vérifier que l'userId est masqué quand demandé
      expect(maskedData.userId).toBe("[DISCORD_ID]");
    });
  });

  describe("Performance Tests", () => {
    it("should validate suggestions efficiently", () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        validator.validateSuggestion(`Test suggestion ${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Moins d'1 seconde
    });

    it("should handle rate limiting efficiently", () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        rateLimiter.canExecute(`user-${i}`, "general");
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // Moins de 500ms
    });

    it("should mask data efficiently", () => {
      const start = Date.now();
      const message =
        "Token: FAKE_TEST_TOKEN_123456789, Email: test@example.com, User: 123456789012345678";

      for (let i = 0; i < 1000; i++) {
        secureLogger.maskSensitiveData(message);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // Moins de 500ms
    });
  });

  describe("Configuration Tests", () => {
    it("should have valid security configuration", () => {
      const stats = secureLogger.getMaskingStats();
      const context = secureLogger.getSecurityContext();

      expect(stats.securityLevel).toBeTruthy();
      expect(stats.patternsCount).toBeTruthy();
      expect(
        context.isDevelopment || context.isProduction || context.isTest
      ).toBe(true);
    });

    it("should handle security levels", () => {
      // Test niveau LOW
      secureLogger.setSecurityLevel("low");
      const lowStats = secureLogger.getMaskingStats();
      expect(lowStats.securityLevel).toBe("low");

      // Test niveau HIGH
      secureLogger.setSecurityLevel("high");
      const highStats = secureLogger.getMaskingStats();
      expect(highStats.securityLevel).toBe("high");

      // Restaurer niveau par défaut
      secureLogger.setSecurityLevel("medium");
    });
  });

  describe("Cleanup Tests", () => {
    it("should reset rate limiter", () => {
      rateLimiter.reset();
      const stats = rateLimiter.getStats();

      expect(stats.totalWindows).toBe(0);
      expect(stats.totalBlocked).toBe(0);
    });

    it("should handle known tokens", () => {
      const testToken = "test-token-123";
      secureLogger.addKnownToken(testToken);

      const stats = secureLogger.getMaskingStats();
      expect(stats.knownTokensCount).toBeGreaterThanOrEqual(1);
    });
  });
});
