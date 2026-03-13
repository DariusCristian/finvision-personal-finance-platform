import { Router } from 'express';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import {
  FinnhubProviderError,
  getCandles,
  getCompanyProfile,
  getQuote,
  isFinnhubConfigured,
  searchSymbol,
} from '../../integrations/finnhub/finnhubClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess } from '../../utils/response.js';
import {
  marketStocksCandlesQuerySchema,
  marketStocksProfileQuerySchema,
  marketStocksQuoteQuerySchema,
  marketStocksSearchQuerySchema,
} from '../../validation/market-stocks.js';

const marketStocksRouter = Router();

const assertFinnhubAvailable = () => {
  if (!isFinnhubConfigured()) {
    throw new AppError({
      message: 'Missing FINNHUB_API_KEY',
      statusCode: 501,
      code: 'FINNHUB_NOT_CONFIGURED',
      details: [{ reason: 'MISSING_FINNHUB_API_KEY' }],
    });
  }
};

const normalizeProviderError = (error) => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof FinnhubProviderError) {
    return new AppError({
      message: error.message,
      statusCode: error.status,
      code: error.code,
      details: error.details,
    });
  }

  return error;
};

const getUnixWindowByRange = (range) => {
  const nowUnix = Math.floor(Date.now() / 1000);

  switch (range) {
    case '1D':
      return {
        resolution: '15',
        from: nowUnix - 2 * 24 * 60 * 60,
        to: nowUnix,
      };
    case '1W':
      return {
        resolution: '60',
        from: nowUnix - 8 * 24 * 60 * 60,
        to: nowUnix,
      };
    case '1M':
      return {
        resolution: 'D',
        from: nowUnix - 32 * 24 * 60 * 60,
        to: nowUnix,
      };
    case '1Y':
      return {
        resolution: 'W',
        from: nowUnix - 370 * 24 * 60 * 60,
        to: nowUnix,
      };
    case 'ALL':
      return {
        resolution: 'W',
        from: nowUnix - 5 * 365 * 24 * 60 * 60,
        to: nowUnix,
      };
    default:
      return {
        resolution: 'D',
        from: nowUnix - 32 * 24 * 60 * 60,
        to: nowUnix,
      };
  }
};

marketStocksRouter.get(
  '/search',
  requireAuth,
  validateRequest({ query: marketStocksSearchQuerySchema }),
  async (req, res, next) => {
    try {
      assertFinnhubAvailable();

      const results = await searchSymbol(req.query.q);

      sendSuccess(
        res,
        {
          results,
        },
        200,
        {
          returned: results.length,
          query: req.query.q,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.get(
  '/quote',
  requireAuth,
  validateRequest({ query: marketStocksQuoteQuerySchema }),
  async (req, res, next) => {
    try {
      assertFinnhubAvailable();

      const settledResults = await Promise.allSettled(req.query.symbols.map((symbol) => getQuote(symbol)));
      const quotes = [];
      const failures = [];

      settledResults.forEach((result, index) => {
        const symbol = req.query.symbols[index];

        if (result.status === 'fulfilled') {
          quotes.push(result.value);
          return;
        }

        const reason = result.reason;

        if (reason instanceof FinnhubProviderError) {
          failures.push({
            symbol,
            status: reason.status,
            code: reason.code,
          });
          return;
        }

        failures.push({
          symbol,
          status: 500,
          code: 'UNKNOWN_ERROR',
        });
      });

      if (quotes.length === 0 && failures.length > 0) {
        const isRateLimited = failures.some((failure) => failure.status === 429);

        throw new AppError({
          message: isRateLimited
            ? 'Finnhub rate limit reached. Please try again shortly.'
            : 'Stock quote provider unavailable.',
          statusCode: isRateLimited ? 429 : 502,
          code: isRateLimited ? 'RATE_LIMITED' : 'FINNHUB_PROVIDER_ERROR',
          details: failures,
        });
      }

      sendSuccess(
        res,
        {
          quotes,
        },
        200,
        {
          returned: quotes.length,
          failed: failures.length,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.get(
  '/profile',
  requireAuth,
  validateRequest({ query: marketStocksProfileQuerySchema }),
  async (req, res, next) => {
    try {
      assertFinnhubAvailable();

      const profile = await getCompanyProfile(req.query.symbol);

      sendSuccess(res, {
        profile,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.get(
  '/candles',
  requireAuth,
  validateRequest({ query: marketStocksCandlesQuerySchema }),
  async (req, res, next) => {
    try {
      assertFinnhubAvailable();

      const { symbol, range } = req.query;
      const rangeWindow = getUnixWindowByRange(range);
      const candlesResult = await getCandles(
        symbol,
        rangeWindow.resolution,
        rangeWindow.from,
        rangeWindow.to,
      );
      const pointsCount = candlesResult.series.length;

      if (env.NODE_ENV === 'development') {
        logger.info('market.stocks.candles.request', {
          symbol,
          range,
          resolution: rangeWindow.resolution,
          from: rangeWindow.from,
          to: rangeWindow.to,
          finnhub_s_value: candlesResult.finnhubStatus ?? null,
          points_count: pointsCount,
        });
      }

      sendSuccess(
        res,
        {
          series: candlesResult.series,
          range,
          symbol,
        },
        200,
        {
          returned: pointsCount,
          status: candlesResult.status,
          reason: candlesResult.reason,
          finnhubStatus: candlesResult.finnhubStatus ?? null,
          resolution: rangeWindow.resolution,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

export { marketStocksRouter };
