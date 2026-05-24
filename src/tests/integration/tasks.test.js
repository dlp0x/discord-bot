import { describe, it, expect, beforeEach, vi } from "vitest";
import updateStatusTask from "../../bot/tasks/updateStatus.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));
import axios from "axios";

vi.mock("../../bot/config.js", () => ({
  default: {
    JSON_URL: "http://test-json-url.com"
  }
}));

vi.mock("../../bot/logger.js", () => ({
  default: {
    info: vi.fn(),
    update: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
import logger from '#shared/logging/logger.js';

vi.mock("../../core/monitor.js", () => ({
  default: {
    handleError: vi.fn(),
    handleTaskError: vi.fn(),
  },
}));
import errorHandler from "../../core/monitor.js";

vi.mock("discord.js", () => ({
  ActivityType: { Custom: 42, Listening: 2 },
}));

const mockSetActivity = vi.fn();
const mockClient = {
  user: {
    setActivity: mockSetActivity,
  },
};

describe("updateStatus task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // S'assurer que mockSetActivity réussit par défaut
    mockSetActivity.mockResolvedValue();
  });

  it("met à jour le status Discord avec la chanson courante", async () => {
    const mockData = {
      icestats: {
        source: {
          title: "Test Song - Test Artist",
        },
      },
    };

    axios.get.mockResolvedValue({ data: mockData });

    await updateStatusTask.execute(mockClient);

    expect(axios.get).toHaveBeenCalledWith("http://test-json-url.com", {
      timeout: 10000,
    });
    expect(mockSetActivity).toHaveBeenCalledWith({
      name: "💿 Test Song - Test Artist",
      type: 42, // ActivityType.Custom
      url: "https://soundshineradio.com",
    });
    expect(logger.update).toHaveBeenCalledWith("Status to: Test Song - Test Artist");
  });

  it("utilise le fallback si axios échoue", async () => {
    axios.get.mockRejectedValue(new Error("axios fail"));

    await updateStatusTask.execute(mockClient);

    expect(errorHandler.handleTaskError).toHaveBeenCalledWith(
      expect.any(Error),
      "UPDATE_STATUS"
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Error fetching metadata or updating status:",
      expect.any(Error)
    );
    // Dans le fallback, setActivity reçoit un objet avec name et type
    expect(mockSetActivity).toHaveBeenCalledWith({
      name: 'Soundshine Radio',
      type: 2, // ActivityType.Listening
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Fallback activity set to Soundshine Radio"
    );
  });

  it("log une erreur si le fallback échoue aussi", async () => {
    axios.get.mockRejectedValue(new Error("axios fail"));
    mockSetActivity.mockRejectedValueOnce(new Error("setActivity fail"));

    await updateStatusTask.execute(mockClient);

    expect(errorHandler.handleTaskError).toHaveBeenCalledWith(
      expect.any(Error),
      "UPDATE_STATUS_FALLBACK"
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Error setting fallback activity:",
      expect.any(Error)
    );
  });
});