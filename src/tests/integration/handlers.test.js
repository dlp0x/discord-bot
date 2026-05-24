import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock complet de discord.js
vi.mock("discord.js", () => ({
  EmbedBuilder: vi.fn(() => ({
    setColor: vi.fn().mockReturnThis(),
    setTitle: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    addFields: vi.fn().mockReturnThis(),
    setFooter: vi.fn().mockReturnThis(),
    setTimestamp: vi.fn().mockReturnThis(),
  })),
  ActionRowBuilder: vi.fn(() => ({
    addComponents: vi.fn().mockReturnThis(),
  })),
  ButtonBuilder: vi.fn(() => ({
    setCustomId: vi.fn().mockReturnThis(),
    setLabel: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
  })),
  ButtonStyle: { Success: 1, Danger: 2, Primary: 3 },
  MessageFlags: { Ephemeral: 64 },
  ActivityType: { Custom: 4, Listening: 2, Playing: 0 },
  GatewayIntentBits: { Guilds: 1, GuildVoiceStates: 2 },
  Partials: { Channel: 1, Message: 2 },
}));

vi.mock("../../bot/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    custom: vi.fn(),
    infocmd: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logDebug: vi.fn(),
  },
}));

vi.mock("../../core/monitor.js", () => ({
  default: {
    handleCommandError: vi.fn(),
  },
}));

// Imports après les mocks
import handlePlaylistSelect from "#bot/handlers/PlaylistSelectHandler.js";
import logger from '#shared/logging/logger.js';
import errorHandler from "../../core/monitor.js";

describe("handlePlaylistSelect", () => {
  let mockInteraction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInteraction = {
      values: ["Test Playlist"],
      user: { id: "user123", tag: "User#1234" },
      update: vi.fn().mockResolvedValue(),
    };
  });

  it("met à jour l'interface de playlist et log le succès", async () => {
    await handlePlaylistSelect(mockInteraction);

    // Vérifier que les logs sont appelés
    expect(logger.info).toHaveBeenCalledWith(
      "Playlist sélectionnée par User#1234: Test Playlist"
    );
    expect(logger.success).toHaveBeenCalledWith(
      "Interface de playlist mise à jour pour User#1234"
    );

    // Vérifier que interaction.update est appelé
    expect(mockInteraction.update).toHaveBeenCalled();
  });

  it("gère les erreurs et appelle errorHandler", async () => {
    const error = new Error("update fail");
    mockInteraction.update.mockRejectedValueOnce(error);

    await expect(handlePlaylistSelect(mockInteraction)).rejects.toThrow(
      "update fail"
    );
    expect(errorHandler.handleCommandError).toHaveBeenCalledWith(
      error,
      mockInteraction
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Erreur dans handlePlaylistSelect:",
      error
    );
  });
});

