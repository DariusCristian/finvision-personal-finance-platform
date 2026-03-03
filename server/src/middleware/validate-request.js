import { ZodError } from 'zod';

import { ValidationError } from '../errors/app-error.js';

export const validateRequest = ({ body, query, params } = {}) => {
  return (req, _res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }

      if (query) {
        req.query = query.parse(req.query);
      }

      if (params) {
        req.params = params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        }));

        next(new ValidationError('Request validation failed', details));
        return;
      }

      next(error);
    }
  };
};
