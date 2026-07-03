import express from 'express';

export function createJsonApp (router) {
  const app = express();
  app.use(router);
  return app;
}

export function createDiscordClientForPlaylist ({
  playlistChannel,
  stageChannel
} = {}) {
  return {
    channels: {
      cache: {
        get: () => playlistChannel
      },
      fetch: async () => stageChannel
    },
    user: { tag: 'soundshine#0001' }
  };
}

export function createTextChannel (overrides = {}) {
  return {
    isTextBased: () => true,
    name: 'playlist',
    send: overrides.send || (async () => ({}))
  };
}

export function createStageChannel (overrides = {}) {
  return {
    createStageInstance: overrides.createStageInstance || (async () => ({})),
    name: 'stage',
    stageInstance: overrides.stageInstance || null,
    type: 13
  };
}
