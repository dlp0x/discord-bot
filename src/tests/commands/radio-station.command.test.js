import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, lastReplyContent } from '../helpers/discordFactory.js';

vi.mock('axios');

const nowPlaying = (await import('#bot/commands/radio/nowplaying.js')).default;
const stats = (await import('#bot/commands/station/stats.js')).default;
const schedule = (await import('#bot/commands/station/schedule.js')).default;
const ping = (await import('#bot/commands/system/ping.js')).default;

describe('radio and station commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repond avec le titre en cours depuis Icecast', async () => {
    axios.get.mockResolvedValue({
      data: { icestats: { source: { title: 'Artist - Song' } } }
    });
    const interaction = createInteraction();

    await nowPlaying.execute(interaction);

    expect(axios.get).toHaveBeenCalledWith(process.env.JSON_URL);
    expect(lastReplyContent(interaction)).toContain('Artist - Song');
  });

  it('utilise une reponse de repli quand Icecast ne renvoie pas de titre', async () => {
    axios.get.mockResolvedValue({ data: { icestats: { source: {} } } });
    const interaction = createInteraction();

    await nowPlaying.execute(interaction);

    expect(lastReplyContent(interaction)).toContain('Aucune chanson');
  });

  it('signale une erreur utilisateur quand Icecast echoue', async () => {
    axios.get.mockRejectedValue(new Error('network down'));
    const interaction = createInteraction();

    await nowPlaying.execute(interaction);

    expect(lastReplyContent(interaction)).toContain('Impossible');
  });

  it('reserve les stats aux administrateurs', async () => {
    const interaction = createInteraction({ roleIds: [] });

    await stats.execute(interaction);

    expect(axios.get).not.toHaveBeenCalled();
    expect(lastReplyContent(interaction)).toContain('administrateurs');
  });

  it('affiche les stats stream et le bouton de details pour les admins', async () => {
    axios.get.mockResolvedValue({
      data: { icestats: { source: { listeners: 12, bitrate: 192 } } }
    });
    const interaction = createInteraction({
      roleIds: [process.env.ADMIN_ROLE_ID]
    });

    await stats.execute(interaction);

    expect(lastReplyContent(interaction)).toContain('Auditeurs : 12');
    expect(interaction.reply.mock.calls[0][0].components).toHaveLength(1);
  });

  it('presente les boutons de choix de langue pour l horaire', async () => {
    const interaction = createInteraction();

    await schedule.execute(interaction);

    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.components).toHaveLength(1);
  });

  it('edite la reponse ping avec les latences calculees', async () => {
    const interaction = createInteraction({
      createdTimestamp: 1000,
      replyTimestamp: 1250,
      client: { ws: { ping: 33 } }
    });

    await ping.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Ping...' });
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('250ms'));
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('33ms'));
  });
});
