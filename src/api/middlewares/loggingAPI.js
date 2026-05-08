// api/middlewares/loggingAPI.js
import logger from '../../bot/logger.js';

export default function loggingAPI() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const log = `${req.method} ${req.url} - ${status} - ${duration}ms - ${req.ip || req.connection.remoteAddress}`;
      status >= 400 ? logger.warn(log) : logger.info(log);
      // supprimé : global.metricsCollector.recordApiRequest(...)
    });
    next();
  };
}

