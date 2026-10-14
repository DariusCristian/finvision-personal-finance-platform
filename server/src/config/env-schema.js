import { z } from 'zod';

// Environment schema, kept free of side effects (no dotenv) so it can be unit tested. src/config/env.js loads
// server/.env and parses process.env with it.

const MIN_JWT_SECRET_LENGTH = 32;
// Values copied from examples or docs; rejected in production even when long enough.
const PLACEHOLDER_SECRET_PATTERN =
  /(change|replace)[_-]?me|placeholder|your[_-]|example|secret[_-]?here/i;

const jwtSecretSchema = (name) =>
  z
    .string({ required_error: `${name} is required (generate one with: openssl rand -base64 48)` })
    .min(
      MIN_JWT_SECRET_LENGTH,
      `${name} must be at least ${MIN_JWT_SECRET_LENGTH} characters (generate one with: openssl rand -base64 48)`,
    );

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(5001),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MONGODB_URI: z.string().min(1),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    JWT_ACCESS_SECRET: jwtSecretSchema('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: jwtSecretSchema('JWT_REFRESH_SECRET'),
    MARKETAUX_API_KEY: z.string().optional().default(''),
    FINNHUB_API_KEY: z.string().optional().default(''),
    COINGECKO_API_KEY: z.string().optional().default(''),
    // Express `trust proxy`: false (default) uses the socket address as the client IP; set the number of reverse
    // proxies in front of the server (e.g. 1) when deployed behind one, so rate limits see the real client IP.
    TRUST_PROXY: z
      .string()
      .optional()
      .default('false')
      .transform((value) => {
        const normalized = String(value).trim().toLowerCase();
        if (/^\d+$/.test(normalized)) return Number(normalized);
        if (normalized === 'true') return true;
        if (normalized === 'false' || normalized === '') return false;
        return value.trim();
      }),
    RATE_LIMIT_ENABLED: z
      .string()
      .optional()
      .default('true')
      .transform(
        (value) => !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase()),
      ),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    REGISTER_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 1000),
    REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    REFRESH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    FINNY_CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    FINNY_CHAT_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 1000),
    ENABLE_FINNHUB_CANDLES_FALLBACK: z
      .string()
      .optional()
      .default('false')
      .transform((value) =>
        ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase()),
      ),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV !== 'production') {
      return;
    }

    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (PLACEHOLDER_SECRET_PATTERN.test(values[name])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} looks like a placeholder; use a random value (openssl rand -base64 48)`,
        });
      }
    }
  });

export const parseEnv = (source) => {
  const parsedEnv = envSchema.safeParse(source);

  if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }

  return {
    ...parsedEnv.data,
    corsOrigins: parsedEnv.data.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
};
