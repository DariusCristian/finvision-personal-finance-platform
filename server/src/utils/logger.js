const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
]);

const redactValue = (key, value) => {
  if (!key) {
    return value;
  }

  if (SENSITIVE_KEYS.has(key)) {
    return '[REDACTED]';
  }

  return value;
};

export const redactHeaders = (headers = {}) => {
  const normalized = {};

  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    normalized[key.toLowerCase()] = redactValue(key.toLowerCase(), value);
  });

  return normalized;
};

const emit = (level, message, context = {}) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const output = JSON.stringify(payload);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.info(output);
      break;
  }
};

export const logger = {
  info: (message, context) => emit('info', message, context),
  warn: (message, context) => emit('warn', message, context),
  error: (message, context) => emit('error', message, context),
};
