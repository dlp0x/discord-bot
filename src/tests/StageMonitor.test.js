import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVoiceConnectionMock = vi.fn();
const promoteToSpeakerMock = vi.fn();
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  success: vi.fn()
};

vi.mock('@discordjs/voice', () => ({
  getVoiceConnection: getVoiceConnectionMock
}));

vi.mock('../bot/logger.js', () => ({
  default: loggerMock
}));

vi.mock('../core/services/StageSpeakerManager.js', () => ({
  default: {
    promoteToSpeaker: promoteToSpeakerMock
  }
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildConnection (channelId = 'stage-1', withPlayer = true) {
  return {
    joinConfig: { channelId },
    state: {
      subscription: withPlayer
        ? { player: { stop: vi.fn() } }
        : undefined
    },
    destroy: vi.fn()
  };
}

function buildVoiceChannel (id = 'stage-1', humanCount = 0, botCount = 1) {
  const humanMembers = { size: humanCount };
  const botMembers   = { size: botCount };
  return {
    id,
    name: 'Main Stage',
    type: 13,
    members: {
      filter: vi.fn(fn =>
        fn({ user: { bot: false } }) ? humanMembers : botMembers
      )
    }
  };
}

function buildGuild (voiceChannel) {
  return {
    channels: { cache: new Map([[voiceChannel.id, voiceChannel]]) }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StageMonitor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── startMonitoring / stopMonitoring ─────────────────────────────────────

  describe('startMonitoring / stopMonitoring', () => {
    it('démarre la surveillance et logue le démarrage', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.startMonitoring();

      expect(stageMonitor.isMonitoring).toBe(true);
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Surveillance des stages démarrée')
      );

      stageMonitor.stopMonitoring();
    });

    it('n\'ouvre pas un deuxième intervalle si déjà en cours', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.startMonitoring();
      stageMonitor.startMonitoring(); // deuxième appel

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('déjà en cours')
      );

      stageMonitor.stopMonitoring();
    });

    it('arrête la surveillance et réinitialise les Maps internes', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.startMonitoring();

      // Injecter des données dans les Maps internes
      stageMonitor.emptyStages.set('guild-x', Date.now());
      stageMonitor.promotingStages.add('guild-x');

      stageMonitor.stopMonitoring();

      expect(stageMonitor.isMonitoring).toBe(false);
      expect(stageMonitor.emptyStages.size).toBe(0);
      expect(stageMonitor.promotingStages.size).toBe(0);
    });

    it('ignorer stopMonitoring si pas encore démarré', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      // Ne doit pas throw
      expect(() => stageMonitor.stopMonitoring()).not.toThrow();
    });
  });

  // ── registerStage / unregisterStage ──────────────────────────────────────

  describe('registerStage / unregisterStage', () => {
    it('enregistre un stage et réinitialise emptyStages', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');
      const voiceChannel = buildVoiceChannel();
      const guild        = buildGuild(voiceChannel);

      getVoiceConnectionMock.mockReturnValue(buildConnection());
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      stageMonitor.emptyStages.set('guild-1', Date.now() - 5000);
      stageMonitor.registerStage('guild-1', 'stage-1', guild);

      expect(stageMonitor.connectedStages.has('guild-1')).toBe(true);
      expect(stageMonitor.emptyStages.has('guild-1')).toBe(false);
    });

    it('désenregistre un stage existant', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');
      const voiceChannel = buildVoiceChannel();
      const guild        = buildGuild(voiceChannel);

      getVoiceConnectionMock.mockReturnValue(buildConnection());
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      stageMonitor.registerStage('guild-1', 'stage-1', guild);
      stageMonitor.unregisterStage('guild-1');

      expect(stageMonitor.connectedStages.has('guild-1')).toBe(false);
      expect(stageMonitor.promotingStages.has('guild-1')).toBe(false);
    });

    it('n\'est pas affecté par unregisterStage sur un guildId inconnu', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      expect(() => stageMonitor.unregisterStage('guild-inconnu')).not.toThrow();
    });
  });

  // ── promoteBotInStage ─────────────────────────────────────────────────────

  describe('promoteBotInStage', () => {
    it('absorbe les erreurs de promotion différée au lieu de laisser une rejection non gérée', async () => {
      const connection = buildConnection();
      const channel    = { id: 'stage-1', name: 'Main Stage', type: 13 };
      const guild      = { channels: { cache: new Map([['stage-1', channel]]) } };

      getVoiceConnectionMock.mockReturnValue(connection);
      promoteToSpeakerMock.mockRejectedValue(new Error('promotion failed'));

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.registerStage('guild-1', 'stage-1', guild);

      // Déclencher le setTimeout(3000) de promoteBotInStage
      await vi.advanceTimersByTimeAsync(3000);
      // Laisser la Promise rejetée (et son catch) se propager dans la microtask queue
      await Promise.resolve();
      await Promise.resolve();

      expect(promoteToSpeakerMock).toHaveBeenCalledTimes(1);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('ignore la promotion si le canal n\'est pas un stage (type !== 13)', async () => {
      const channel = { id: 'chan-1', name: 'Vocal', type: 2 };
      const guild   = { channels: { cache: new Map([['chan-1', channel]]) } };

      getVoiceConnectionMock.mockReturnValue(buildConnection('chan-1'));

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.registerStage('guild-1', 'chan-1', guild);
      await vi.advanceTimersByTimeAsync(3000);

      expect(promoteToSpeakerMock).not.toHaveBeenCalled();
      expect(loggerMock.debug).toHaveBeenCalledWith(
        expect.stringContaining('promotion ignorée')
      );
    });

    it('ignore la promotion si le bot est déjà speaker (suppress === false)', async () => {
      const channel = {
        id:   'stage-1',
        name: 'Main Stage',
        type: 13,
        guild: {
          members: {
            me: {
              id: 'bot-id',
              voice: { channelId: 'stage-1', suppress: false }
            }
          }
        }
      };
      const guild = { channels: { cache: new Map([['stage-1', channel]]) } };

      getVoiceConnectionMock.mockReturnValue(buildConnection());

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.registerStage('guild-1', 'stage-1', guild);
      await vi.advanceTimersByTimeAsync(3000);

      expect(promoteToSpeakerMock).not.toHaveBeenCalled();
      expect(loggerMock.debug).toHaveBeenCalledWith(
        expect.stringContaining('déjà speaker')
      );
    });

    it('ignore une deuxième promotion si une est déjà en cours (garde-fou anti-boucle)', async () => {
      const channel = { id: 'stage-1', name: 'Main Stage', type: 13 };
      const guild   = { channels: { cache: new Map([['stage-1', channel]]) } };

      getVoiceConnectionMock.mockReturnValue(buildConnection());
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      // Injecter le stage sans passer par registerStage pour éviter la promotion initiale
      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild, lastCheck: Date.now() });

      // Simuler une promotion déjà en cours
      stageMonitor.promotingStages.add('guild-1');

      // Tenter une promotion manuelle — doit être bloquée par le garde-fou
      stageMonitor.promoteBotInStage('guild-1', 'stage-1');
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();

      expect(promoteToSpeakerMock).not.toHaveBeenCalled();
      expect(loggerMock.debug).toHaveBeenCalledWith(
        expect.stringContaining('Promotion déjà en cours')
      );
    });

    it('logue un avertissement quand la connexion est absente au moment de la promotion', async () => {
      const channel = { id: 'stage-1', name: 'Main Stage', type: 13 };
      const guild   = { channels: { cache: new Map([['stage-1', channel]]) } };

      getVoiceConnectionMock.mockReturnValue(null);

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.registerStage('guild-1', 'stage-1', guild);
      await vi.advanceTimersByTimeAsync(3000);

      expect(promoteToSpeakerMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('Pas de connexion active')
      );
    });
  });

  // ── checkStage ────────────────────────────────────────────────────────────

  describe('checkStage', () => {
    it('déconnecte proprement quand il ne reste que des bots dans un stage surveillé (délai de grâce écoulé)', async () => {
      const connection   = buildConnection();
      const voiceChannel = buildVoiceChannel('stage-1', 0, 1);
      const guild        = buildGuild(voiceChannel);

      getVoiceConnectionMock.mockReturnValue(connection);
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.registerStage('guild-1', 'stage-1', guild);
      const checkPromise = stageMonitor.checkStage('guild-1', 'stage-1');
      await vi.advanceTimersByTimeAsync(3500);
      await checkPromise;

      expect(connection.state.subscription.player.stop).toHaveBeenCalledWith(true);
      expect(connection.destroy).toHaveBeenCalledTimes(1);
      expect(stageMonitor.connectedStages.has('guild-1')).toBe(false);
    });

    it('marque le stage comme vide au premier appel mais n\'envoie pas encore la déconnexion', async () => {
      const connection   = buildConnection();
      const voiceChannel = buildVoiceChannel('stage-1', 0, 1);
      const guild        = buildGuild(voiceChannel);

      getVoiceConnectionMock.mockReturnValue(connection);
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');
      // Réduire le délai de grâce pour le test
      stageMonitor.disconnectGraceMs = 10000;

      stageMonitor.registerStage('guild-1', 'stage-1', guild);
      await stageMonitor.checkStage('guild-1', 'stage-1');

      expect(stageMonitor.emptyStages.has('guild-1')).toBe(true);
      expect(connection.destroy).not.toHaveBeenCalled();
    });

    it('annule la déconnexion si un humain rejoint avant la fin du délai de grâce', async () => {
      const connection        = buildConnection();
      const emptyChannel      = buildVoiceChannel('stage-1', 0, 1);
      const occupiedChannel   = buildVoiceChannel('stage-1', 1, 1);
      const guild             = buildGuild(emptyChannel);

      getVoiceConnectionMock.mockReturnValue(connection);
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.registerStage('guild-1', 'stage-1', guild);

      // Premier check → stage vide
      await stageMonitor.checkStage('guild-1', 'stage-1');
      expect(stageMonitor.emptyStages.has('guild-1')).toBe(true);

      // Un humain revient
      guild.channels.cache.set('stage-1', occupiedChannel);
      await stageMonitor.checkStage('guild-1', 'stage-1');

      expect(stageMonitor.emptyStages.has('guild-1')).toBe(false);
      expect(connection.destroy).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Humain(s) de retour')
      );
    });

    it('désenregistre le stage si la connexion est perdue', async () => {
      const voiceChannel = buildVoiceChannel();
      const guild        = buildGuild(voiceChannel);

      getVoiceConnectionMock.mockReturnValue(null);
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      // Enregistrer manuellement sans passer par registerStage pour éviter la promotion
      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild, lastCheck: Date.now() });
      await stageMonitor.checkStage('guild-1', 'stage-1');

      expect(stageMonitor.connectedStages.has('guild-1')).toBe(false);
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Connexion perdue')
      );
    });

    it('logue un avertissement si le canal de connexion ne correspond pas', async () => {
      const connection   = buildConnection('autre-canal');
      const voiceChannel = buildVoiceChannel();
      const guild        = buildGuild(voiceChannel);

      getVoiceConnectionMock.mockReturnValue(connection);

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild, lastCheck: Date.now() });
      await stageMonitor.checkStage('guild-1', 'stage-1');

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('Canal de connexion différent')
      );
    });

    it('désenregistre le stage si le canal vocal est introuvable dans le cache', async () => {
      const guild = { channels: { cache: new Map() } }; // cache vide

      getVoiceConnectionMock.mockReturnValue(buildConnection());

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild, lastCheck: Date.now() });
      await stageMonitor.checkStage('guild-1', 'stage-1');

      expect(stageMonitor.connectedStages.has('guild-1')).toBe(false);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('Canal vocal introuvable')
      );
    });
  });

  // ── checkAllStages ────────────────────────────────────────────────────────

  describe('checkAllStages', () => {
    it('ne fait rien s\'il n\'y a aucun stage enregistré', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      await expect(stageMonitor.checkAllStages()).resolves.toBeUndefined();
      expect(getVoiceConnectionMock).not.toHaveBeenCalled();
    });

    it('appelle checkStage pour chaque stage enregistré', async () => {
      const connection1  = buildConnection('stage-1');
      const connection2  = buildConnection('stage-2');
      const voiceChannel1 = buildVoiceChannel('stage-1', 1, 0);
      const voiceChannel2 = buildVoiceChannel('stage-2', 1, 0);
      const guild1       = buildGuild(voiceChannel1);
      const guild2       = buildGuild(voiceChannel2);

      getVoiceConnectionMock
        .mockReturnValueOnce(connection1)
        .mockReturnValueOnce(connection2);

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild: guild1, lastCheck: Date.now() });
      stageMonitor.connectedStages.set('guild-2', { channelId: 'stage-2', guild: guild2, lastCheck: Date.now() });

      await stageMonitor.checkAllStages();

      // Les deux connexions ont été consultées
      expect(getVoiceConnectionMock).toHaveBeenCalledTimes(2);
    });
  });

  // ── disconnectFromStage ───────────────────────────────────────────────────

  describe('disconnectFromStage', () => {
    it('déconnecte sans appeler stop si le player est absent', async () => {
      const connection = buildConnection('stage-1', false); // sans player
      const voiceChannel = { name: 'Main Stage' };

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild: null, lastCheck: Date.now() });
      await stageMonitor.disconnectFromStage(connection, 'guild-1', voiceChannel);

      expect(connection.destroy).toHaveBeenCalledTimes(1);
    });

    it('remet isDisconnecting à false même en cas d\'erreur', async () => {
      const connection = {
        joinConfig: { channelId: 'stage-1' },
        state: { subscription: { player: { stop: vi.fn(() => { throw new Error('stop failed'); }) } } },
        destroy: vi.fn()
      };
      const voiceChannel = { name: 'Main Stage' };

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      await stageMonitor.disconnectFromStage(connection, 'guild-1', voiceChannel);

      expect(stageMonitor.isDisconnecting).toBe(false);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('ignore un deuxième appel simultané grâce au flag isDisconnecting', async () => {
      const connection   = buildConnection();
      const voiceChannel = { name: 'Main Stage' };

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.isDisconnecting = true;
      await stageMonitor.disconnectFromStage(connection, 'guild-1', voiceChannel);

      expect(connection.destroy).not.toHaveBeenCalled();
    });
  });

  // ── handleVoiceStateUpdate ────────────────────────────────────────────────

  describe('handleVoiceStateUpdate', () => {
    it('enregistre un nouveau stage quand le bot rejoint un canal de type 13', async () => {
      getVoiceConnectionMock.mockReturnValue(buildConnection('stage-2'));
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      const newChannel = { id: 'stage-2', name: 'New Stage', type: 13 };
      const guild      = {
        id: 'guild-1',
        channels: { cache: new Map([['stage-2', newChannel]]) },
        members: { me: { id: 'bot-id' } }
      };

      const oldState = { channelId: null, member: { id: 'bot-id' }, guild };
      const newState = {
        channelId: 'stage-2',
        channel: newChannel,
        member: { id: 'bot-id' },
        guild
      };

      stageMonitor.handleVoiceStateUpdate(oldState, newState);

      expect(stageMonitor.connectedStages.has('guild-1')).toBe(true);
    });

    it('ignore le VoiceStateUpdate du bot quand il reste dans le même canal', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      const guild = { id: 'guild-1', members: { me: { id: 'bot-id' } } };
      const state = {
        channelId: 'stage-1',
        member: { id: 'bot-id' },
        guild
      };

      stageMonitor.handleVoiceStateUpdate(state, state);

      expect(stageMonitor.connectedStages.has('guild-1')).toBe(false);
      expect(loggerMock.debug).toHaveBeenCalledWith(
        expect.stringContaining('VoiceStateUpdate du bot ignoré')
      );
    });

    it('planifie un checkStage quand un humain quitte un canal surveillé', async () => {
      getVoiceConnectionMock.mockReturnValue(buildConnection());
      promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

      const voiceChannel = buildVoiceChannel('stage-1', 0, 1);
      const guild        = {
        id: 'guild-1',
        channels: { cache: new Map([['stage-1', voiceChannel]]) },
        members: { me: { id: 'bot-id' } }
      };

      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild, lastCheck: Date.now() });

      const humanState = {
        channelId: 'stage-1',
        member: { id: 'human-id' },
        guild: { id: 'guild-1' }
      };

      stageMonitor.handleVoiceStateUpdate(humanState, { channelId: null, member: { id: 'human-id' }, guild: guild });

      // Le setTimeout de 2 s est planifié — avancer le temps pour qu'il s'exécute
      await vi.advanceTimersByTimeAsync(2500);

      // getVoiceConnection doit avoir été appelé lors du checkStage différé
      expect(getVoiceConnectionMock).toHaveBeenCalled();
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('retourne un objet de statut cohérent avec l\'état interne', async () => {
      const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

      stageMonitor.startMonitoring();
      stageMonitor.connectedStages.set('guild-1', { channelId: 'stage-1', guild: null, lastCheck: Date.now() });
      stageMonitor.emptyStages.set('guild-1', Date.now());

      const status = stageMonitor.getStatus();

      expect(status).toMatchObject({
        isMonitoring: true,
        connectedStages: 1,
        emptyStages: 1,
        checkInterval: expect.any(Number),
        disconnectGraceMs: expect.any(Number)
      });

      stageMonitor.stopMonitoring();
    });
  });
});