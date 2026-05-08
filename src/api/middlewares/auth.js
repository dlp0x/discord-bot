// src/api/middlewares/auth.js  (NOUVEAU fichier)
export function requireApiToken(req, res, next) {
    if (req.headers['x-api-key'] !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  }