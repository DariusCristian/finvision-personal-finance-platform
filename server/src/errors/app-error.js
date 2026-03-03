export class AppError extends Error {
  constructor({ message, statusCode, code, details = [] }) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super({
      message,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details,
    });
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', details = []) {
    super({
      message,
      statusCode: 401,
      code: 'AUTH_ERROR',
      details,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = []) {
    super({
      message,
      statusCode: 404,
      code: 'NOT_FOUND_ERROR',
      details,
    });
  }
}

export class ExternalApiError extends AppError {
  constructor(message = 'External service failure', details = []) {
    super({
      message,
      statusCode: 502,
      code: 'EXTERNAL_API_ERROR',
      details,
    });
  }
}
