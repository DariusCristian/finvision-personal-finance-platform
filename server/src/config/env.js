import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
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
    .transform((value) => !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  REGISTER_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  REFRESH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  FINNY_CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  FINNY_CHAT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  ENABLE_FINNHUB_CANDLES_FALLBACK: z
    .string()
    .optional()
    .default('false')
    .transform((value) => ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
}

export const env = {
  ...parsedEnv.data,
  corsOrigins: parsedEnv.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
