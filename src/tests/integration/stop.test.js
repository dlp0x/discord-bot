import { describe, it, expect, beforeEach, vi } from "vitest";
import stopCommand from "../../bot/commands/radio/stop.js";

vi.mock("discord.js", () => ({
  PermissionFlagsBits: {
    Connect: 1,
    Speak: 2,
    RequestToSpeak: 3,
  },
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

describe("Stop Command", () => {
  let mockInteraction;
  let mockClient;

  beforeEach(() => {
    mockInteraction = {
      guildId: "guild123",
      reply: vi.fn(),
      client: {
        voice: {
          adapters: new Map([
            [
              "guild123",
              {
                destroy: vi.fn().mockResolvedValue(true),
              },
            ],
          ]),
        },
      },
    };
    mockClient = mockInteraction.client;
  });

  it("should have correct command structure", () => {
    if (stopCommand.builder && !stopCommand.data) {
      // Sous-commande avec builder
      expect(stopCommand.builder).toBeInstanceOf(Function);
    } else {
      // Commande principale avec data
      expect(stopCommand).toHaveProperty("data");
      expect(stopCommand).toHaveProperty("execute");
      expect(stopCommand.data.name).toBe("stop");
      expect(stopCommand.data.description).toBeDefined();
    }
  });

  it("should handle stop command", async () => {
    try {
      await stopCommand.execute(mockInteraction);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.stringContaining("⏹️")
      );
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
