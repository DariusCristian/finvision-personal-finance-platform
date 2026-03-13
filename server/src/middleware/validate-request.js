import { ZodError } from 'zod';

import { ValidationError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';
import { mapZodIssues } from '../utils/validation.js';

export const validateRequest = ({ body, query, params } = {}) => {
  return (req, _res, next) => {
    let failingSegment = null;

    try {
      if (body) {
        failingSegment = 'body';
        req.body = body.parse(req.body);
      }

      if (query) {
        failingSegment = 'query';
        req.query = query.parse(req.query);
      }

      if (params) {
        failingSegment = 'params';
        req.params = params.parse(req.params);
      }

      failingSegment = null;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        if (failingSegment === 'query' && process.env.NODE_ENV !== 'production') {
          logger.warn('request.validation.query_failed', {
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            query: req.query,
          });
        }

        const message =
          failingSegment === 'query'
            ? 'Invalid query params'
            : failingSegment === 'params'
              ? 'Invalid path params'
              : failingSegment === 'body'
                ? 'Invalid request body'
                : 'Request validation failed';

        next(new ValidationError(message, mapZodIssues(error.issues)));
        return;
      }

      next(error);
    }
  };
};
