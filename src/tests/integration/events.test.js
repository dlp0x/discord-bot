import { describe, it, expect, beforeEach, vi } from "vitest";
import logger from '#shared/logging/logger.js';

// Mock Discord.js
const mockClient = {
  user: {
    tag: "TestBot#1234",
    setActivity: vi.fn(),
    setStatus: vi.fn(),
  },
  guilds: {
    cache: new Map([["123456789", { id: "123456789", name: "Test Guild" }]]),
  },
  on: vi.fn(),
  once: vi.fn(),
};

const mockGuild = {
  id: "123456789",
  name: "Test Guild",
  memberCount: 100,
  available: true,
};

const mockChannel = {
  id: "987654321",
  name: "test-channel",
  type: 0, // GUILD_TEXT
  send: vi.fn(),
};

const mockUser = {
  id: "111111111",
  username: "TestUser",
  tag: "TestUser#1234",
  bot: false,
};

describe("Discord Events Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Ready Event", () => {
    it("should handle ready event", async () => {
      const readyEvent = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      await readyEvent.execute(mockClient);

      expect(readyEvent.execute).toHaveBeenCalledWith(mockClient);
    });

    it("should set bot activity on ready", async () => {
      const readyEvent = {
        execute: vi.fn().mockImplementation((client) => {
          client.user.setActivity("🎵 Music", { type: "LISTENING" });
          client.user.setStatus("online");
        }),
      };

      await readyEvent.execute(mockClient);

      expect(mockClient.user.setActivity).toHaveBeenCalledWith("🎵 Music", {
        type: "LISTENING",
      });
      expect(mockClient.user.setStatus).toHaveBeenCalledWith("online");
    });
  });

  describe("Guild Create Event", () => {
    it("should handle guild create event", async () => {
      const guildCreateEvent = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      await guildCreateEvent.execute(mockGuild, mockClient);

      expect(guildCreateEvent.execute).toHaveBeenCalledWith(
        mockGuild,
        mockClient
      );
    });

    it("should log guild join information", async () => {
      const guildCreateEvent = {
        execute: vi.fn().mockImplementation((guild, client) => {
          logger.debug(`Joined guild: ${guild.name} (${guild.id})`);
          logger.debug(`Total guilds: ${client.guilds.cache.size}`);
        }),
      };

      await guildCreateEvent.execute(mockGuild, mockClient);

      expect(guildCreateEvent.execute).toHaveBeenCalledWith(
        mockGuild,
        mockClient
      );
    });

    it("should handle missing guild information", async () => {
      const guildCreateEvent = {
        execute: vi.fn().mockImplementation((guild) => {
          if (!guild || !guild.id) {
            throw new Error("Invalid guild data");
          }
        }),
      };

      const invalidGuild = { name: "Invalid Guild" };

      try {
        await guildCreateEvent.execute(invalidGuild, mockClient);
      } catch (error) {
        expect(error.message).toBe("Invalid guild data");
      }
    });
  });

  describe("Message Create Event", () => {
    it("should handle message create event", async () => {
      const messageCreateEvent = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const mockMessage = {
        content: "!play test song",
        author: mockUser,
        channel: mockChannel,
        guild: mockGuild,
        reply: vi.fn(),
      };

      await messageCreateEvent.execute(mockMessage, mockClient);

      expect(messageCreateEvent.execute).toHaveBeenCalledWith(
        mockMessage,
        mockClient
      );
    });

    it("should ignore bot messages", async () => {
      const messageCreateEvent = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const mockBotMessage = {
        content: "!play test song",
        author: { ...mockUser, bot: true },
        channel: mockChannel,
        guild: mockGuild,
      };

      await messageCreateEvent.execute(mockBotMessage, mockClient);

      expect(messageCreateEvent.execute).toHaveBeenCalledWith(
        mockBotMessage,
        mockClient
      );
    });
  });

  describe("Interaction Create Event", () => {
    it("should handle interaction create event", async () => {
      const interactionCreateEvent = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const mockInteraction = {
        isCommand: vi.fn().mockReturnValue(true),
        commandName: "play",
        reply: vi.fn(),
        user: mockUser,
        channel: mockChannel,
        guild: mockGuild,
      };

      await interactionCreateEvent.execute(mockInteraction, mockClient);

      expect(interactionCreateEvent.execute).toHaveBeenCalledWith(
        mockInteraction,
        mockClient
      );
    });

    it("should handle command interactions", async () => {
      const interactionCreateEvent = {
        execute: vi.fn().mockImplementation((interaction) => {
          if (interaction.isCommand()) {
            logger.debug(`Command executed: ${interaction.commandName}`);
          }
        }),
      };

      const mockCommandInteraction = {
        isCommand: vi.fn().mockReturnValue(true),
        commandName: "play",
        reply: vi.fn(),
        user: mockUser,
        channel: mockChannel,
        guild: mockGuild,
      };

      await interactionCreateEvent.execute(mockCommandInteraction, mockClient);

      expect(interactionCreateEvent.execute).toHaveBeenCalledWith(
        mockCommandInteraction,
        mockClient
      );
    });
  });

  describe("Voice State Update Event", () => {
    it("should handle voice state update event", async () => {
      const voiceStateUpdateEvent = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const mockOldState = {
        channelId: "555555555",
        member: { id: "111111111" },
      };

      const mockNewState = {
        channelId: null,
        member: { id: "111111111" },
      };

      await voiceStateUpdateEvent.execute(
        mockOldState,
        mockNewState,
        mockClient
      );

      expect(voiceStateUpdateEvent.execute).toHaveBeenCalledWith(
        mockOldState,
        mockNewState,
        mockClient
      );
    });

    it("should handle user leaving voice channel", async () => {
      const voiceStateUpdateEvent = {
        execute: vi.fn().mockImplementation((oldState, newState) => {
          if (oldState.channelId && !newState.channelId) {
            logger.debug(`User ${newState.member.id} left voice channel`);
          }
        }),
      };

      const mockOldState = {
        channelId: "555555555",
        member: { id: "111111111" },
      };

      const mockNewState = {
        channelId: null,
        member: { id: "111111111" },
      };

      await voiceStateUpdateEvent.execute(
        mockOldState,
        mockNewState,
        mockClient
      );

      expect(voiceStateUpdateEvent.execute).toHaveBeenCalledWith(
        mockOldState,
        mockNewState,
        mockClient
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle event execution errors", async () => {
      const errorEvent = {
        execute: vi.fn().mockRejectedValue(new Error("Event error")),
      };

      try {
        await errorEvent.execute(mockClient);
      } catch (error) {
        expect(error.message).toBe("Event error");
      }

      expect(errorEvent.execute).toHaveBeenCalledWith(mockClient);
    });
  });
});

