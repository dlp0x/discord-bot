import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import playlistUpdateRouter from '#api/routes/playlist-update.js';
import {
  createDiscordClientForPlaylist,
  createJsonApp,
  createStageChannel,
  createTextChannel
} from '../helpers/apiFactory.js';

describe('playlist update API route', () => {
  it('refuse les appels sans token API valide', async () => {
    const app = createJsonApp(playlistUpdateRouter(createDiscordClientForPlaylist()));

    const response = await request(app)
      .post('/')
      .send({ playlist: 'Morning', topic: 'Live' });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('API token');
  });

  it('valide le body avant de modifier Discord', async () => {
    const playlistSend = vi.fn();
    const app = createJsonApp(playlistUpdateRouter(createDiscordClientForPlaylist({
      playlistChannel: createTextChannel({ send: playlistSend }),
      stageChannel: createStageChannel()
    })));

    const response = await request(app)
      .post('/')
      .set('x-api-key', process.env.API_TOKEN)
      .send({ playlist: '', topic: 'Live' });

    expect(response.status).toBe(400);
    expect(playlistSend).not.toHaveBeenCalled();
  });

  it('envoie la playlist et cree une instance de stage', async () => {
    const playlistSend = vi.fn(async () => ({}));
    const createStageInstance = vi.fn(async () => ({}));
    const app = createJsonApp(playlistUpdateRouter(createDiscordClientForPlaylist({
      playlistChannel: createTextChannel({ send: playlistSend }),
      stageChannel: createStageChannel({ createStageInstance })
    })));

    const response = await request(app)
      .post('/')
      .set('x-api-key', process.env.API_TOKEN)
      .send({ playlist: 'Morning Show', topic: 'Live now' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(playlistSend).toHaveBeenCalledWith({
      embeds: [expect.objectContaining({
        description: expect.stringContaining('Morning Show')
      })]
    });
    expect(createStageInstance).toHaveBeenCalledWith({ topic: 'Live now' });
  });

  it('retourne PARTIAL si la playlist part mais que le stage echoue', async () => {
    const app = createJsonApp(playlistUpdateRouter(createDiscordClientForPlaylist({
      playlistChannel: createTextChannel({ send: vi.fn(async () => ({})) }),
      stageChannel: createStageChannel({
        createStageInstance: vi.fn(async () => {
          throw new Error('missing permissions');
        })
      })
    })));

    const response = await request(app)
      .post('/')
      .set('x-api-key', process.env.API_TOKEN)
      .send({ playlist: 'Morning Show', topic: 'Live now' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PARTIAL');
    expect(response.body.details.playlistSent).toBe(true);
    expect(response.body.details.stageTopic).toBe(false);
  });
});
