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
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().optional().default('gpt-4.1-mini'),
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
