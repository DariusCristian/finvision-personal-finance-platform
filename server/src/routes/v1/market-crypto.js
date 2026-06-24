import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  CoinGeckoProviderError,
  getMarketChart,
  getSimplePrices,
  isCoinGeckoConfigured,
  searchCoins,
} from '../../integrations/coingecko/coingeckoClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { sendSuccess } from '../../utils/response.js';
import {
  marketChartQuerySchema,
  marketQuoteQuerySchema,
  marketSearchQuerySchema,
} from '../../validation/invest.js';

const marketCryptoRouter = Router();

const resolveVsCurrency = (value) => {
  const normalizedValue = String(value || 'eur').trim().toLowerCase();

  return {
    requested: normalizedValue || 'eur',
    used: 'eur',
    pricingCurrency: 'EUR',
    note:
      normalizedValue && normalizedValue !== 'eur'
        ? 'Crypto pricing is fixed to EUR in the invest module.'
        : null,
  };
};

const normalizeProviderError = (error) => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof CoinGeckoProviderError) {
    return new AppError({
      message: error.message,
      statusCode: error.status,
      code: error.code,
      details: error.details,
    });
  }

  return error;
};

const assertCoinGeckoAvailable = () => {
  if (!isCoinGeckoConfigured()) {
    throw new AppError({
      message: 'Missing COINGECKO_API_KEY',
      statusCode: 501,
      code: 'COINGECKO_NOT_CONFIGURED',
      details: [{ reason: 'MISSING_COINGECKO_API_KEY' }],
    });
  }
};

marketCryptoRouter.get(
  '/search',
  requireAuth,
  validateRequest({ query: marketSearchQuerySchema }),
  async (req, res, next) => {
    try {
      assertCoinGeckoAvailable();

      const query = req.query.q;
      const coins = await searchCoins(query);

      sendSuccess(
        res,
        {
          coins,
        },
        200,
        {
          returned: coins.length,
          query,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketCryptoRouter.get(
  '/quote',
  requireAuth,
  validateRequest({ query: marketQuoteQuerySchema }),
  async (req, res, next) => {
    try {
      assertCoinGeckoAvailable();

      const coinIds = req.query.coinIds;

      const vsContext = resolveVsCurrency(req.query.vs);
      const pricesMap = await getSimplePrices(coinIds, vsContext.used);

      sendSuccess(
        res,
        {
          quotes: pricesMap,
          requestedVs: vsContext.requested,
          usedVs: vsContext.used,
          pricingCurrency: vsContext.pricingCurrency,
          pricingNote: vsContext.note,
        },
        200,
        {
          returned: Object.keys(pricesMap).length,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketCryptoRouter.get(
  '/chart',
  requireAuth,
  validateRequest({ query: marketChartQuerySchema }),
  async (req, res, next) => {
    try {
      assertCoinGeckoAvailable();

      const vsContext = resolveVsCurrency(req.query.vs);
      const chartPoints = await getMarketChart(req.query.coinId, vsContext.used, req.query.days);

      sendSuccess(
        res,
        {
          points: chartPoints,
          requestedVs: vsContext.requested,
          usedVs: vsContext.used,
          pricingCurrency: vsContext.pricingCurrency,
          pricingNote: vsContext.note,
        },
        200,
        {
          returned: chartPoints.length,
          days: req.query.days,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

export { marketCryptoRouter };
