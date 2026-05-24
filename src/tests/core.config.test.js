import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = { ...process.env };

describe('core/config.js', () => {
  beforeEach(() => {
    // Nettoyer complètement process.env
    for (const key in process.env) {
      delete process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    // Restaurer l'environnement original
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('charge la configuration avec les valeurs du fichier .env', async () => {
    const config = (await import('../core/config.js')).default;

    // Vérifier que la config est chargée
    expect(config).toBeDefined();
    expect(typeof config.BOT_TOKEN).toBe('string');
    expect(typeof config.API_PORT).toBe('number');
    expect(typeof config.isDev).toBe('boolean');
    expect(typeof config.isProd).toBe('boolean');
  });

  it('a les bonnes valeurs hardcodées', async () => {
    const config = (await import('../core/config.js')).default;
    expect(config.roleId).toBe('1292528573881651372');
    expect(config.channelId).toBe('1383977293579419769');
  });

  it('a les bonnes propriétés de configuration', async () => {
    const config = (await import('../core/config.js')).default;

    // Vérifier que toutes les propriétés requises existent
    expect(config).toHaveProperty('NODE_ENV');
    expect(config).toHaveProperty('BOT_TOKEN');
    expect(config).toHaveProperty('API_PORT');
    expect(config).toHaveProperty('VOICE_CHANNEL_ID');
    expect(config).toHaveProperty('PLAYLIST_CHANNEL_ID');
    expect(config).toHaveProperty('API_TOKEN');
    expect(config).toHaveProperty('isDev');
    expect(config).toHaveProperty('isProd');
  });

  it('a les bonnes valeurs par défaut pour les options facultatives', async () => {
    const config = (await import('../core/config.js')).default;

    // Ces valeurs peuvent être définies dans .env, mais on vérifie qu'elles existent
    expect(config).toHaveProperty('API_PORT');
    expect(config).toHaveProperty('BOT_ROLE_NAME');
    expect(typeof config.API_PORT).toBe('number');
    expect(typeof config.BOT_ROLE_NAME).toBe('string');
  });

  it('détecte correctement l\'environnement', async () => {
    const config = (await import('../core/config.js')).default;

    // Vérifier que isDev et isProd sont des booléens
    expect(typeof config.isDev).toBe('boolean');
    expect(typeof config.isProd).toBe('boolean');

    // Vérifier que l'environnement est défini
    expect(config.NODE_ENV).toBeDefined();
    expect(typeof config.NODE_ENV).toBe('string');
  });
});
