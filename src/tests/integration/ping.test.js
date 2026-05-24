import { describe, it, expect, beforeEach, vi } from "vitest";
import pingCommand from "../../bot/commands/system/ping.js";

vi.mock("discord.js", () => ({
  MessageFlags: { Ephemeral: 64 },
  SlashCommandBuilder: class {
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(description) {
      this.description = description;
      return this;
    }
    setDMPermission() {
      return this;
    }
    setDefaultMemberPermissions() {
      return this;
    }
  },
}));

describe("Ping Command", () => {
  let mockInteraction;
  let mockClient;

  beforeEach(() => {
    const now = Date.now();
    mockInteraction = {
      createdTimestamp: now,
      reply: vi.fn().mockResolvedValue({ createdTimestamp: now + 50 }),
      editReply: vi.fn().mockResolvedValue(true),
      deferReply: vi.fn().mockResolvedValue(true),
      followUp: vi.fn().mockResolvedValue(true),
      replied: false,
      deferred: false,
      user: { id: "bot123", username: "TestBot", tag: "TestBot#1234" },
      guilds: {
        cache: new Map([
          ["987654321", { id: "987654321", name: "Test Guild" }],
        ]),
      },
      client: {
        ws: {
          ping: 25, // Ajout du ping ici, nécessaire pour la commande
        },
      },
    };
    mockClient = mockInteraction.client;
  });

  it("should execute ping command successfully", async () => {
    await pingCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Ping...",
      fetchReply: true,
    });
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("🏓 Pong !")
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Latence bot:")
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Latence API:")
    );
  });

  it("should handle ping command errors gracefully", async () => {
    mockInteraction.reply.mockRejectedValueOnce(new Error("Network error"));
    const originalError = console.error;
    console.error = vi.fn();
    try {
      await pingCommand.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "❌ Erreur lors de la vérification de la latence.",
        flags: expect.any(Number),
      });
    } finally {
      console.error = originalError;
    }
  });
});
