// api/routes.js
import healthRoutes from './routes/health.js';

import playlistRoutes from './routes/playlist-update.js';
import silenceRoutes from './routes/silence.js';

export default function loadRoutes (app, client, logger) {
  app.get('/', (req, res) => {
    res.json({
      name: 'soundSHINE Bot API',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/v1/health',

        playlist: '/v1/playlist-update',
        silence: '/v1/silence'
      }
    });
  });

  app.use('/v1/health', healthRoutes(client, logger));

  app.use('/v1/playlist-update', playlistRoutes(client, logger));
  app.use('/v1/silence', silenceRoutes(client, logger));

  // 404
  app.use((req, res) => {
    res.status(404).json({
      error: 'Route non trouvée',
      path: req.originalUrl,
      method: req.method
    });
  });
}

