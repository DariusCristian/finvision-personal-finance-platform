import { z } from 'zod';

const normalizeSymbols = (value) =>
  String(value || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
const marketStocksModeSchema = z.enum(['funded', 'demo']);

export const marketStocksSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required.').max(80),
});

export const marketStocksQuoteQuerySchema = z
  .object({
    symbols: z.string().trim().min(1, 'symbols is required.'),
  })
  .transform((value) => ({
    symbols: [...new Set(normalizeSymbols(value.symbols))],
  }))
  .pipe(
    z.object({
      symbols: z.array(z.string().min(1)).min(1, 'Provide at least one symbol.').max(20),
    }),
  );

export const marketStocksProfileQuerySchema = z.object({
  symbol: z.string().trim().min(1, 'symbol is required.').max(16).transform((value) => value.toUpperCase()),
});

export const marketStocksCandlesQuerySchema = z.object({
  symbol: z.string().trim().min(1, 'symbol is required.').max(16).transform((value) => value.toUpperCase()),
  range: z.enum(['1D', '1W', '1M', '6M', '1Y', 'ALL']).default('1M'),
});

export const marketStocksOrderSchema = z.object({
  symbol: z.string().trim().min(1, 'symbol is required.').max(16).transform((value) => value.toUpperCase()),
  side: z.enum(['buy', 'sell']),
  quantity: z.coerce.number().positive('Quantity must be greater than zero.'),
});

export const marketStocksTradesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export const marketStocksPerformanceQuerySchema = z.object({
  range: z.enum(['7d', '30d']).optional().default('7d'),
});

export const marketTopUpFromWalletSchema = z.object({
  amountRON: z.coerce.number().positive('Top-up amount must be greater than zero.'),
});

export const marketStocksModeMutationSchema = z.object({
  mode: marketStocksModeSchema,
});

export const marketStocksDemoBudgetSchema = z.object({
  amountEUR: z.coerce.number().positive('Demo budget must be greater than zero.'),
});
