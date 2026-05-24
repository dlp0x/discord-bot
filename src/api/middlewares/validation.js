// ========================================
// api/middlewares/validation.js
// ========================================

import { z } from 'zod';
import logger from '#shared/logging/logger.js';
import validator from '#shared/validation/validation.js';

// =========================
// SCHEMAS (Zod reste ici)
// =========================
const userInputSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(100),
  userId: z.string().min(17).max(20),
  username: z.string().min(1).max(32)
});

const playlistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tracks: z.array(z.string().url()).min(1).max(100)
});

const apiKeySchema = z.object({
  'x-api-key': z.string().min(32).max(64)
});

// =========================
// GENERIC VALIDATION MIDDLEWARE
// =========================
export function validateRequest (schema) {
  return (req, res, next) => {
    try {
      const raw = {
        ...req.body,
        ...req.query,
        ...req.params
      };

      const sanitized = validator.sanitizeObject(raw);
      const validated = schema.parse(sanitized);

      req.body = { ...req.body, ...validated };
      req.query = { ...req.query, ...validated };
      req.params = { ...req.params, ...validated };

      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        logger.warn('Validation failed', {
          path: req.path,
          errors: err.errors
        });

        return res.status(400).json({
          error: 'Invalid input',
          details: err.errors
        });
      }

      logger.error('Validation middleware error', err);
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
}