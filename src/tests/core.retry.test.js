import { describe, it, expect, beforeEach, vi } from "vitest";
import { RetryManager, retry } from "#core/services/retry.js";

// Mock du logger pour éviter les effets de bord
vi.mock("#shared/logging/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

describe("RetryManager", () => {
  let manager;

  beforeEach(() => {
    manager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 1,
      maxDelay: 5,
      jitter: false,
    });
    // Mock sleep pour accélérer les tests
    vi.spyOn(manager, "sleep").mockImplementation(() => Promise.resolve());
  });

  it("exécute une opération qui réussit du premier coup", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    const res = await manager.execute(op);
    expect(res).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retry sur erreur retryable puis succès", async () => {
    const error = new Error("ECONNRESET");
    error.code = "ECONNRESET";
    const op = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("ok");
    const res = await manager.execute(op);
    expect(res).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("lance une erreur après maxAttempts", async () => {
    const error = new Error("ECONNRESET");
    error.code = "ECONNRESET";
    const op = vi.fn().mockRejectedValue(error);
    await expect(manager.execute(op)).rejects.toThrow("ECONNRESET");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("ne retry pas sur erreur non-retryable", async () => {
    const error = new Error("FATAL");
    error.code = "FATAL";
    const op = vi.fn().mockRejectedValue(error);
    await expect(manager.execute(op)).rejects.toThrow("FATAL");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("accepte des options custom", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    const res = await manager.execute(op, { maxAttempts: 2 });
    expect(res).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe("retry (fonction utilitaire)", () => {
  it("fonctionne comme prévu", async () => {
    let count = 0;
    const op = async () => {
      count++;
      if (count < 2)
        throw Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
      return "ok";
    };
    const res = await retry(op, {
      maxAttempts: 3,
      baseDelay: 1,
      maxDelay: 5,
      jitter: false,
    });
    expect(res).toBe("ok");
  });
});

