import { ZodError } from 'zod';

import { AppError, NotFoundError, ValidationError } from '../errors/app-error.js';

const toZodDetails = (error) => {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
};

export const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler = (error, req, res, _next) => {
  let normalizedError;

  if (error instanceof AppError) {
    normalizedError = error;
  } else if (error instanceof ZodError) {
    normalizedError = new ValidationError('Request validation failed', toZodDetails(error));
  } else {
    normalizedError = new AppError({
      message: 'Internal server error',
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[server:error]', {
      requestId: req.requestId,
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown error payload',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

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
