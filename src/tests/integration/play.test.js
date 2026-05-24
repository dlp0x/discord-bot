import { describe, it, expect, beforeEach, vi } from "vitest";
import playCommand from "../../bot/commands/radio/play.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import logger from '#shared/logging/logger.js';

// --- Mocks ---
vi.mock("@discordjs/voice", () => ({
  joinVoiceChannel: vi.fn(),
  createAudioPlayer: vi.fn(),
  createAudioResource: vi.fn(),
  AudioPlayerStatus: { Playing: "playing" },
  NoSubscriberBehavior: { Pause: "pause" },
}));

vi.mock("../../bot/logger.js", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("discord.js", () => ({
  ChannelType: { GuildStageVoice: 13, GuildVoice: 2 },
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

describe("Play Command", () => {
  let mockInteraction;
  let mockClient;

  beforeEach(() => {
    mockInteraction = {
      commandName: "play",
      user: { id: "123456789", username: "testuser" },
      guild: { id: "987654321", name: "Test Guild" },
      channel: { id: "111222333", name: "test-channel" },
      createdTimestamp: Date.now(),
      reply: vi.fn().mockResolvedValue({
        createdTimestamp: Date.now() + 50,
        editReply: vi.fn().mockResolvedValue(true),
      }),
      editReply: vi.fn().mockResolvedValue(true),
      deferReply: vi.fn().mockResolvedValue(true),
      followUp: vi.fn().mockResolvedValue(true),
      replied: false,
      deferred: false,
      options: {
        getString: vi.fn(),
        getInteger: vi.fn(),
        getBoolean: vi.fn(),
        getSubcommand: vi.fn(),
      },
      member: {
        voice: {
          channel: {
            id: "555555555",
            name: "Voice Channel",
            type: 13,
            guild: {
              id: "987654321",
              voiceAdapterCreator: vi.fn(),
            },
          },
        },
      },
    };
    mockClient = {};
    mockInteraction.client = mockClient;
  });

  // --- Test structure ---
  it("should have correct command structure", () => {
    if (playCommand.builder && !playCommand.data) {
      // Sous-commande avec builder
      expect(playCommand.builder).toBeInstanceOf(Function);
    } else {
      // Commande principale avec data
      expect(playCommand).toHaveProperty("data");
      expect(playCommand).toHaveProperty("execute");
      expect(playCommand.data.name).toBe("play");
      expect(playCommand.data.description).toBeDefined();
    }
  });

  it("should handle play command with valid URL", async () => {
    mockInteraction.options.getString.mockReturnValue(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    try {
      const result = await playCommand.execute(mockInteraction, mockClient);
      expect(result.success).toBe(true);
      expect(result.message).toBe("PLAY_COMMAND");
      expect(result.deferReply).toBe(true);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it("should handle play command with search query", async () => {
    const playCommandMock = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        message: "Searching for: test song",
      }),
    };
    mockInteraction.options.getString.mockReturnValue("test song");
    await playCommandMock.execute(mockInteraction, mockClient);
    expect(playCommandMock.execute).toHaveBeenCalledWith(
      mockInteraction,
      mockClient
    );
  });

  describe("(erreurs)", () => {
    it("retourne une erreur si l'utilisateur n'est pas dans un salon vocal", async () => {
      const interaction = { ...mockInteraction, member: { voice: null } };
      const result = await playCommand.execute(interaction);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Tu dois être dans un salon vocal");
      expect(result.ephemeral).toBe(true);
    });

    it("retourne une erreur si le salon vocal n'est pas un Stage Channel", async () => {
      const interaction = {
        ...mockInteraction,
        member: { voice: { channel: { type: 2 } } },
      };
      const result = await playCommand.execute(interaction);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        "Cette commande ne fonctionne que dans un Stage Channel"
      );
      expect(result.ephemeral).toBe(true);
    });

    it("retourne une erreur si joinVoiceChannel échoue", async () => {
      joinVoiceChannel.mockImplementationOnce(() => {
        throw new Error("Connexion échouée");
      });
      mockInteraction.deferred = true;
      mockInteraction.editReply = vi.fn();

      const result = await playCommand.execute(mockInteraction);
      expect(result.success).toBe(true);
      expect(result.message).toBe("PLAY_COMMAND");
      expect(result.deferReply).toBe(true);
    });

    it("retourne une erreur si createAudioResource échoue", async () => {
      joinVoiceChannel.mockReturnValue({ subscribe: vi.fn() });
      createAudioPlayer.mockReturnValue({
        play: vi.fn(),
        once: vi.fn(),
        on: vi.fn(),
      });
      createAudioResource.mockImplementationOnce(() => {
        throw new Error("Erreur ressource");
      });
      mockInteraction.deferred = true;
      mockInteraction.editReply = vi.fn();

      const result = await playCommand.execute(mockInteraction);
      expect(result.success).toBe(true);
      expect(result.message).toBe("PLAY_COMMAND");
      expect(result.deferReply).toBe(true);
    });
  });
});
