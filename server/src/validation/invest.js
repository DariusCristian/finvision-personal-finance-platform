import { z } from 'zod';

const portfolioSideSchema = z.enum(['buy', 'sell']);
const vsCurrencySchema = z.enum(['usd', 'eur', 'ron']);
const allowedChartDays = [1, 7, 30, 90, 365];

const normalizeSearchValue = (...values) => {
  const resolved = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof resolved === 'string' ? resolved.trim() : '';
};

const parseCoinIds = (value) =>
  String(value || '')
    .split(',')
    .map((coinId) => coinId.trim().toLowerCase())
    .filter(Boolean);

export const investOrderSchema = z.object({
  coinId: z.string().trim().min(1, 'coinId is required.'),
  symbol: z
    .string()
    .trim()
    .min(1, 'symbol is required.')
    .max(12)
    .transform((value) => value.toUpperCase()),
  side: portfolioSideSchema,
  quantity: z.coerce.number().positive('Quantity must be greater than zero.'),
});

export const investStockOrderSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, 'symbol is required.')
    .max(16)
    .transform((value) => value.toUpperCase()),
  side: portfolioSideSchema,
  quantity: z.coerce.number().positive('Quantity must be greater than zero.'),
});

export const investTradesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export const investSnapshotsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(7),
});

export const investFundingQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const investTopUpQuoteQuerySchema = z.object({
  amount: z.coerce.number().positive('Top-up amount must be greater than zero.'),
  fromCurrency: z.literal('RON').optional().default('RON'),
});

export const investTopUpSchema = z.object({
  fromCurrency: z.literal('RON').optional().default('RON'),
  amount: z.coerce.number().positive('Top-up amount must be greater than zero.'),
});

export const marketSearchQuerySchema = z
  .object({
    q: z.string().optional(),
    query: z.string().optional(),
    search: z.string().optional(),
  })
  .transform((value) => ({
    q: normalizeSearchValue(value.q, value.query, value.search),
  }))
  .pipe(
    z.object({
      q: z
        .string()
        .trim()
        .min(2, 'Search query must be at least 2 characters.')
        .max(80, 'Search query is too long.'),
    }),
  );

export const marketQuoteQuerySchema = z
  .object({
    coinIds: z.string().optional(),
    ids: z.string().optional(),
    vs: vsCurrencySchema.optional().default('eur'),
  })
  .transform((value) => ({
    coinIds: parseCoinIds(value.coinIds ?? value.ids),
    vs: value.vs ?? 'eur',
  }))
  .pipe(
    z.object({
      coinIds: z
        .array(z.string().min(1))
        .min(1, 'Provide at least one coin id.')
        .max(50, 'Maximum 50 coin ids can be requested at once.'),
      vs: vsCurrencySchema.default('eur'),
    }),
  );

export const marketChartQuerySchema = z.object({
  coinId: z.string().trim().min(1, 'coinId is required.'),
  vs: vsCurrencySchema.optional().default('eur'),
  days: z
    .coerce
    .number()
    .int()
    .optional()
    .default(7)
    .refine((value) => allowedChartDays.includes(value), {
      message: 'days must be one of 1, 7, 30, 90, 365.',
    }),
});
