// middlewares/prometheusMiddleware.js
import metrics from '#core/services/MetricsCollector.js';
import logger from '#shared/logging/logger.js';
export default function prometheusMiddleware (req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    try {
      metrics.recordApiRequest(
        req.method,
        req.route?.path || req.originalUrl,
        res.statusCode,
        duration
      );
    } catch (error) {
      logger.error('Erreur lors de l\'enregistrement de la requête API:', error);
      // rien de critique ici
    }
  });

  next();
}
