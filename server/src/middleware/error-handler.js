import { ZodError } from 'zod';

import { AppError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';
import { mapZodIssues } from '../utils/validation.js';

export const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler = (error, req, res, _next) => {
  let normalizedError;

  if (error instanceof AppError) {
    normalizedError = error;
  } else if (error instanceof ZodError) {
    normalizedError = new ValidationError('Request validation failed', mapZodIssues(error.issues));
  } else {
    normalizedError = new AppError({
      message: 'Internal server error',
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  logger.error('request.failed', {
    requestId: req.requestId,
    code: normalizedError.code,
    statusCode: normalizedError.statusCode,
    method: req.method,
    path: req.originalUrl,
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Unknown error payload',
    stack: process.env.NODE_ENV === 'production' ? undefined : error instanceof Error ? error.stack : undefined,
  });

  res.status(normalizedError.statusCode).json({
    success: false,
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
      details: normalizedError.details,
    },
    requestId: req.requestId,
  });
};
