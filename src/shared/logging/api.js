// api/middlewares/loggingAPI.js
import logger from './logger.js';

export default function loggingAPI () {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const log = `${req.method} ${req.url} - ${status} - ${duration}ms - ${req.ip || req.connection.remoteAddress}`;
      if (status >= 400) {
        logger.warn(log);
      } else {
        logger.info(log);
      }
    });
    next();
  };
}
