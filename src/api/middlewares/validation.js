// ========================================
// api/middlewares/validation.js
// ========================================

import { z } from 'zod';
import logger from '#shared/logging/logger.js';
import validator from '#shared/validation/validation.js';

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
