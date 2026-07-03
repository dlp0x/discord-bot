import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("#shared/logging/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockRequestRender = vi.fn();
vi.mock("#api/services/templatedClient.js", () => ({
  requestRender: (...args) => mockRequestRender(...args),
}));

import logger from "#shared/logging/logger.js";
import {
  publishPlaylistUpdate,
  formatProgramAnnouncement,
} from "#api/services/socialPublishService.js";

describe("socialPublishService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatProgramAnnouncement", () => {
    it("combines the topic with the current hour in America/Toronto", () => {
      // 2026-01-15T23:00:00Z -> 18:00 in America/Toronto (EST, UTC-5)
      const fixedDate = new Date("2026-01-15T23:00:00Z");
      expect(formatProgramAnnouncement("Lofi", fixedDate)).toBe("Lofi — 18h");
    });
  });

  describe("publishPlaylistUpdate", () => {
    it("requests a Templated render and returns a normalized success result", async () => {
      mockRequestRender.mockResolvedValue({
        id: "render-123",
        url: "https://cdn.templated.io/renders/render-123.png",
        status: "completed",
        template: "test-template-id",
      });

      const result = await publishPlaylistUpdate({ playlist: "Test Playlist", topic: "Lofi" });

      expect(mockRequestRender).toHaveBeenCalledTimes(1);
      const [layers] = mockRequestRender.mock.calls[0];
      expect(layers.title.text).toMatch(/^Lofi — \d{2}h$/);
      expect(layers.subtitle.text).toBe("Test Playlist");

      expect(result).toEqual({
        status: "rendered",
        id: "render-123",
        url: "https://cdn.templated.io/renders/render-123.png",
        template: "test-template-id",
        renderStatus: "completed",
      });
    });

    it("logs and returns a normalized failure result when Templated rendering fails, without throwing", async () => {
      mockRequestRender.mockRejectedValue(new Error("Templated render response is missing required fields (id/url)"));

      const result = await publishPlaylistUpdate({ playlist: "Test Playlist", topic: "Lofi" });

      expect(result.status).toBe("failed");
      expect(result.error).toMatch(/missing required fields/i);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it("does not throw on network failure, still returns a normalized failure result", async () => {
      mockRequestRender.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        publishPlaylistUpdate({ playlist: "Test Playlist", topic: "Lofi" })
      ).resolves.toEqual(
        expect.objectContaining({ status: "failed", error: "ECONNREFUSED" })
      );
    });
  });
});
