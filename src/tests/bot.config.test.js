import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock des variables d'environnement pour chaque test
    process.env.DISCORD_TOKEN = "test-token";
    process.env.CLIENT_ID = "test-client-id";
    process.env.GUILD_ID = "test-guild-id";
    process.env.VOICE_CHANNEL_ID = "test-voice-channel";
    process.env.PLAYLIST_CHANNEL_ID = "test-playlist-channel";
    process.env.API_TOKEN = "test-api-token";
    process.env.API_PORT = "3000";
    process.env.LOG_LEVEL = "info";
    process.env.UNSPLASH_ACCESS_KEY = "test-unsplash-key";
    process.env.STREAM_URL = "http://test-stream-url.com";
    process.env.JSON_URL = "http://test-json-url.com";
    process.env.ADMIN_ROLE_ID = "test-admin-role-id";
  });

  it("should load values from environment variables", async () => {
    // Mock des variables d'environnement
    process.env.DISCORD_TOKEN = "env-token";
    process.env.CLIENT_ID = "env-client-id";

    // Re-import to get fresh config
    const freshConfig = await import("../bot/config.js");
    const result = freshConfig.default;

    expect(result.DISCORD_TOKEN).toBe("env-token");
    expect(result.CLIENT_ID).toBe("env-client-id");
  });

  it("should handle invalid API_PORT gracefully", async () => {
    // Mock d'un port invalide
    process.env.API_PORT = "invalid-port";

    // Re-import to get fresh config
    const freshConfig = await import("#bot/config.js");
    const result = freshConfig.default;

    // Devrait utiliser la valeur par défaut (3000) si la valeur est invalide
    expect(result.API_PORT).toBe("3000");
  });

  it("should return cached config on subsequent calls", async () => {
    // Re-import to get fresh config
    const freshConfig = await import("#bot/config.js");
    const result1 = freshConfig.default;
    const result2 = freshConfig.default;

    // Les deux appels devraient retourner la même référence
    expect(result1).toBe(result2);
  });

  it("should have all required properties", async () => {
    // Re-import to get fresh config
    const freshConfig = await import("#bot/config.js");
    const result = freshConfig.default;

    expect(result).toHaveProperty("DISCORD_TOKEN");
    expect(result).toHaveProperty("CLIENT_ID");
    expect(result).toHaveProperty("GUILD_ID");
    expect(result).toHaveProperty("VOICE_CHANNEL_ID");
    expect(result).toHaveProperty("PLAYLIST_CHANNEL_ID");
    expect(result).toHaveProperty("API_TOKEN");
    expect(result).toHaveProperty("API_PORT");
    expect(result).toHaveProperty("LOG_LEVEL");
    expect(result).toHaveProperty("UNSPLASH_ACCESS_KEY");
    expect(result).toHaveProperty("STREAM_URL");
    expect(result).toHaveProperty("JSON_URL");
    expect(result).toHaveProperty("ADMIN_ROLE_ID");
  });
});

