// api/routes.js
import healthRoutes from './routes/health.js';
import playlistRoutes from './routes/playlist-update.js';


export default function loadRoutes (app, client, logger) {
  app.get('/v1', (req, res) => {
    res.json({
      name: 'soundSHINE Bot API',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        playlist: '/playlist-update',
        
      }
    });
  });

  app.use('/health', healthRoutes(client, logger));
  app.use('/playlist-update', playlistRoutes(client, logger));

  // 404
  app.use((req, res) => {
    res.status(404).json({
      error: 'Route non trouvée',
      path: req.originalUrl,
      method: req.method
    });
  });
}

