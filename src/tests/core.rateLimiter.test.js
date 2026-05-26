import { describe, it, expect, beforeEach, vi } from "vitest";
import rateLimiter, {
  checkRateLimit,
  recordCommand,
  isUserBlocked,
  unblockUser,
  getRateLimitStats,
} from "#core/services/rateLimiter.js";

// Mock du logger pour éviter les effets de bord
vi.mock("#shared/logging/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

describe("rateLimiter", () => {
  const userId = "user-test";
  const commandType = "general";

  beforeEach(() => {
    rateLimiter.reset();
  });

  it("autorise les requêtes sous la limite", () => {
    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(userId, commandType);
      expect(res.allowed).toBe(true);
    }
  });

  it("bloque après avoir dépassé la limite", () => {
    const max = rateLimiter.configs[commandType].maxRequests;
    for (let i = 0; i < max; i++) {
      checkRateLimit(userId, commandType);
    }
    const res = checkRateLimit(userId, commandType);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("isUserBlocked retourne true après blocage", () => {
    const max = rateLimiter.configs[commandType].maxRequests;
    for (let i = 0; i < max + 1; i++) {
      checkRateLimit(userId, commandType);
    }
    expect(isUserBlocked(userId, commandType)).toBe(true);
  });

  it("unblockUser débloque l'utilisateur", () => {
    const max = rateLimiter.configs[commandType].maxRequests;
    for (let i = 0; i < max + 1; i++) {
      checkRateLimit(userId, commandType);
    }
    expect(isUserBlocked(userId, commandType)).toBe(true);
    unblockUser(userId, commandType);
    expect(isUserBlocked(userId, commandType)).toBe(false);
  });

  it("reset() réinitialise toutes les limitations", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit(userId, commandType);
    }
    rateLimiter.reset();
    const stats = getRateLimitStats();
    expect(stats.totalWindows).toBe(0);
    expect(stats.totalBlocked).toBe(0);
  });

  it("getRateLimitStats retourne les stats correctes", () => {
    checkRateLimit(userId, commandType);
    const stats = getRateLimitStats();
    expect(stats.totalWindows).toBeGreaterThanOrEqual(1);
    expect(stats.commandStats[commandType]).toBeDefined();
  });
});

