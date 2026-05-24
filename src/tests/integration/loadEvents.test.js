import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}));
vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args) => args.join("/")),
    dirname: vi.fn(() => "/fake/dir"),
  },
}));
vi.mock("node:url", () => ({
  pathToFileURL: vi.fn((p) => ({ href: `file://${p}` })),
  fileURLToPath: vi.fn(() => "/fake/dir/loadEvents.js"),
}));
vi.mock("../logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    custom: vi.fn(),
    section: vi.fn(),
  },
}));

const importMock = vi.fn();
import { loadEvents } from "#bot/bootstrap/loadEvents.js";
import * as fs from "node:fs";

describe("loadEvents", () => {
  let client;
  beforeEach(() => {
    vi.clearAllMocks();
    client = {
      on: vi.fn(),
      once: vi.fn(),
    };
  });

  it("charge les events valides", async () => {
    fs.default.existsSync.mockReturnValue(true);
    fs.default.readdirSync.mockReturnValue(["ready.js"]);
    importMock.mockResolvedValueOnce({
      default: { name: "ready", execute: vi.fn(), once: false },
    });
    const res = await loadEvents(client, importMock);
    expect(res.loaded).toContain("ready");
    expect(res.failed).toHaveLength(0);
    expect(client.on).toHaveBeenCalledWith("ready", expect.any(Function));
  });

  it("charge les events valides avec once", async () => {
    fs.default.existsSync.mockReturnValue(true);
    fs.default.readdirSync.mockReturnValue(["guildCreate.js"]);
    importMock.mockResolvedValueOnce({
      default: { name: "guildCreate", execute: vi.fn(), once: true },
    });
    const res = await loadEvents(client, importMock);
    expect(res.loaded).toContain("guildCreate");
    expect(res.failed).toHaveLength(0);
    expect(client.once).toHaveBeenCalledWith(
      "guildCreate",
      expect.any(Function)
    );
  });

  it("gère les events invalides", async () => {
    fs.default.existsSync.mockReturnValue(true);
    fs.default.readdirSync.mockReturnValue(["bad.js"]);
    importMock.mockResolvedValueOnce({ default: {} });
    const res = await loadEvents(client, importMock);
    expect(res.loaded).toHaveLength(0);
    expect(res.failed).toContain("bad.js");
  });

  it("gère les erreurs d'import", async () => {
    fs.default.existsSync.mockReturnValue(true);
    fs.default.readdirSync.mockReturnValue(["fail.js"]);
    importMock.mockRejectedValueOnce(new Error("fail"));
    const res = await loadEvents(client, importMock);
    expect(res.loaded).toHaveLength(0);
    expect(res.failed).toContain("fail.js");
  });

  it("gère le dossier manquant", async () => {
    fs.default.existsSync.mockReturnValue(false);
    const res = await loadEvents(client, importMock);
    expect(res.loaded).toHaveLength(0);
    expect(res.failed).toHaveLength(0);
    expect(res.total).toBe(0);
  });
});
