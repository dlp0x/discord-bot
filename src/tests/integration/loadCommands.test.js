import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from 'node:fs';
import path from 'node:path';
import { loadCommands } from "../../bot/handlers/loadCommands.js";

// Mocks
vi.mock('node:fs');
vi.mock('node:path');
vi.mock('node:url', () => ({
  pathToFileURL: vi.fn((filePath) => ({ href: `file://${filePath}` })),
  fileURLToPath: vi.fn(() => '/mock/handlers')
}));

vi.mock('../../bot/logger.js', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    section: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    custom: vi.fn(),
    debug: vi.fn(), // Ajout pour vérifier les sous-commandes ignorées
  },
}));
import logger from '#shared/logging/logger.js';

describe('loadCommands', () => {
  let mockClient;
  let mockImportFn;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { commands: new Map() };
    mockImportFn = vi.fn();
    path.join.mockImplementation((...args) => args.filter(Boolean).join('/'));
    path.dirname.mockReturnValue('/mock/handlers');
  });

  afterEach(() => vi.restoreAllMocks());

  describe('cas de succès basique', () => {
    it('charge une commande simple avec succès', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([{ name: 'ping.js', isDirectory: () => false, isFile: () => true }]);
      mockImportFn.mockResolvedValue({
        default: { data: { name: 'ping' }, execute: vi.fn() }
      });

      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(1);
      expect(result.loaded[0]).toEqual({ name: 'ping', file: 'ping.js', category: 'general' });
      expect(result.failed).toHaveLength(0);
      expect(result.total).toBe(1);
      expect(mockClient.commands.has('ping')).toBe(true);
      expect(logger.success).toHaveBeenCalledWith('1 commandes chargées avec succès');
    });

    it('charge des commandes dans des sous-dossiers', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync
        .mockReturnValueOnce([
          { name: 'moderation', isDirectory: () => true, isFile: () => false },
          { name: 'ping.js', isDirectory: () => false, isFile: () => true }
        ])
        .mockReturnValueOnce([{ name: 'ban.js', isDirectory: () => false, isFile: () => true }]);

      const mockPingCommand = { default: { data: { name: 'ping' }, execute: vi.fn() } };
      const mockBanCommand = { default: { data: { name: 'ban' }, execute: vi.fn() } };
      mockImportFn.mockResolvedValueOnce(mockBanCommand).mockResolvedValueOnce(mockPingCommand);

      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(2);
      expect(result.categories).toEqual({ 'moderation': ['ban'], 'general': ['ping'] });
      expect(logger.custom).toHaveBeenCalledWith('CMD', 'ban (moderation)');
      expect(logger.custom).toHaveBeenCalledWith('CMD', 'ping (general)');
    });
  });

  describe('cas d\'erreur - validation des modules', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([{ name: 'invalid.js', isDirectory: () => false, isFile: () => true }]);
    });

    it('rejette un module sans export default', async () => {
      mockImportFn.mockResolvedValue({});
      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(0);
      expect(result.failed[0].error).toBe("Pas d'export default dans invalid.js");
      expect(logger.warn).toHaveBeenCalledWith("Pas d'export default dans invalid.js");
    });

    it('rejette un module sans data.name', async () => {
      mockImportFn.mockResolvedValue({ default: { execute: vi.fn() } });
      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.failed[0].error).toBe('Pas de data.name dans invalid.js');
    });

    it('rejette un module sans fonction execute', async () => {
      mockImportFn.mockResolvedValue({ default: { data: { name: 'test' } } });
      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.failed[0].error).toBe('Pas de fonction execute dans invalid.js');
    });

    it('ignore les sous-commandes avec builder mais sans data', async () => {
      const mockCommand = { default: { builder: vi.fn(), execute: vi.fn() } };
      mockImportFn.mockResolvedValue(mockCommand);
      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Sous-commande ignorée'));
    });
  });

  describe('gestion des doublons', () => {
    it('détecte et rejette les commandes dupliquées', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        { name: 'ping1.js', isDirectory: () => false, isFile: () => true },
        { name: 'ping2.js', isDirectory: () => false, isFile: () => true }
      ]);

      const mockCommand1 = { default: { data: { name: 'ping' }, execute: vi.fn() } };
      const mockCommand2 = { default: { data: { name: 'ping' }, execute: vi.fn() } };
      mockImportFn.mockResolvedValueOnce(mockCommand1).mockResolvedValueOnce(mockCommand2);

      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(1);
      expect(result.failed[0].error).toContain('déjà enregistrée (doublon');
    });
  });

  describe('validation approfondie', () => {
    it('accepte un module avec builder et data valide', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([{ name: 'valid.js', isDirectory: () => false, isFile: () => true }]);
      const mockCommand = { default: { data: { name: 'test' }, builder: vi.fn(), execute: vi.fn() } };
      mockImportFn.mockResolvedValue(mockCommand);

      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
    });

    it('ignore un module avec builder mais sans data', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([{ name: 'subcommand.js', isDirectory: () => false, isFile: () => true }]);
      const mockCommand = { default: { builder: vi.fn(), execute: vi.fn() } };
      mockImportFn.mockResolvedValue(mockCommand);

      const result = await loadCommands(mockClient, mockImportFn);

      expect(result.loaded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Sous-commande ignorée'));
    });
  });
});
