import { describe, it, expect, beforeEach, vi } from "vitest";
import { maskSensitiveData, secureLogger } from "#shared/logging/secureLogger.js";

// Mock du logger pour éviter les effets de bord
vi.mock("#shared/logging/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

describe("secureLogger - maskSensitiveData", () => {
  beforeEach(() => {
    secureLogger.setSecurityLevel("medium");
  });

  it("masque les tokens", () => {
    const msg = "token: 'abc12345678901234567890'";
    const masked = maskSensitiveData(msg);
    expect(masked).toContain("[TOKEN_MASQUÉ]");
  });

  it("masque les emails", () => {
    const msg = "Contact: test@example.com";
    const masked = maskSensitiveData(msg, "medium", { maskEmails: true });
    expect(masked).toContain("[EMAIL_MASQUÉ]");
  });

  it("masque les mots de passe", () => {
    const msg = "password: 'supersecret'";
    const masked = maskSensitiveData(msg);
    expect(masked).toContain("[MOT_DE_PASSE_MASQUÉ]");
  });

  it("masque les Discord IDs dans les contextes appropriés", () => {
    const msg = "userId: 123456789012345678";
    const masked = maskSensitiveData(msg, "medium", { maskIds: true });
    expect(masked).toContain("[DISCORD_ID]");
  });

  it("ne masque pas les données non sensibles", () => {
    const msg = "Ceci est un message normal.";
    const masked = maskSensitiveData(msg);
    expect(masked).toBe(msg);
  });

  it("masque les URLs avec token", () => {
    const msg = "https://example.com/api?token=abc123";
    const masked = maskSensitiveData(msg);
    expect(masked).toContain("[URL_MASQUÉE]");
  });

  it("masque les IPs privées en production", () => {
    // Simuler le contexte production
    secureLogger.securityContext.isProduction = true;
    const msg = "IP: 192.168.1.42";
    const masked = maskSensitiveData(msg);
    expect(masked).toContain("[IP_MASQUÉE]");
    // Reset
    secureLogger.securityContext.isProduction = false;
  });

  it("masque les clés privées", () => {
    const msg =
      "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----";
    const masked = maskSensitiveData(msg);
    expect(masked).toContain("[CLÉ_PRIVÉE_MASQUÉE]");
  });
});

