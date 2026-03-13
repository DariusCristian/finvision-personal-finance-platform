import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  CoinGeckoProviderError,
  getSimplePrices,
  isCoinGeckoConfigured,
} from '../../integrations/coingecko/coingeckoClient.js';
import { FxProviderError, convert } from '../../integrations/fx/frankfurterClient.js';
import {
  FinnhubProviderError,
  getQuote,
  isFinnhubConfigured,
} from '../../integrations/finnhub/finnhubClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { InvestFunding } from '../../models/invest-funding.js';
import { PortfolioAccount } from '../../models/portfolio-account.js';
import { PortfolioHolding } from '../../models/portfolio-holding.js';
import { PortfolioSnapshot } from '../../models/portfolio-snapshot.js';
import { PortfolioTrade } from '../../models/portfolio-trade.js';
import { sendSuccess } from '../../utils/response.js';
import {
  investFundingQuerySchema,
  investOrderSchema,
  investSnapshotsQuerySchema,
  investStockOrderSchema,
  investTopUpQuoteQuerySchema,
  investTopUpSchema,
  investTradesQuerySchema,
} from '../../validation/invest.js';

const investRouter = Router();

const STARTING_CASH_BALANCE = 10000;
const MIN_HOLDING_QUANTITY = 0.00000001;
const INVEST_BASE_CURRENCY = 'EUR';
const INVEST_PRICING_VS = 'eur';
const INVEST_PRICING_CURRENCY = 'EUR';

const toNumber = (value, fractionDigits = 8) => Number(Number(value).toFixed(fractionDigits));

const toIsoDay = (date = new Date()) => date.toISOString().slice(0, 10);

const serializeAccount = (account) => ({
  id: account._id.toString(),
  cashBalance: toNumber(account.cashBalance),
  baseCurrency: INVEST_BASE_CURRENCY,
  pricingCurrency: INVEST_PRICING_CURRENCY,
  pricingVs: INVEST_PRICING_VS,
  pricingNote: null,
  createdAt: account.createdAt?.toISOString?.() ?? null,
  updatedAt: account.updatedAt?.toISOString?.() ?? null,
});

const serializeTrade = (trade) => ({
  id: trade._id.toString(),
  assetType: trade.assetType,
  coinId: trade.coinId,
  symbol: trade.symbol,
  side: trade.side,
  quantity: toNumber(trade.quantity),
  price: toNumber(trade.price),
  total: toNumber(trade.total),
  createdAt: trade.createdAt?.toISOString?.() ?? null,
});

const serializeSnapshot = (snapshot) => ({
  id: snapshot._id.toString(),
  date: snapshot.date,
  totalValue: toNumber(snapshot.totalValue),
  cashBalance: toNumber(snapshot.cashBalance),
  holdingsValue: toNumber(snapshot.holdingsValue),
  createdAt: snapshot.createdAt?.toISOString?.() ?? null,
});

const serializeFunding = (funding) => ({
  id: funding._id.toString(),
  fromCurrency: funding.fromCurrency,
  fromAmount: toNumber(funding.fromAmount),
  toCurrency: funding.toCurrency,
  toAmount: toNumber(funding.toAmount),
  rate: toNumber(funding.rate, 10),
  provider: funding.provider,
  createdAt: funding.createdAt?.toISOString?.() ?? null,
});

const ensurePortfolioAccount = async (authUser) => {
  let account = await PortfolioAccount.findOne({ userId: authUser._id });

  if (!account) {
    account = await PortfolioAccount.create({
      userId: authUser._id,
      baseCurrency: INVEST_BASE_CURRENCY,
      cashBalance: STARTING_CASH_BALANCE,
    });

    return account;
  }

  if (account.baseCurrency !== INVEST_BASE_CURRENCY) {
    account.baseCurrency = INVEST_BASE_CURRENCY;
    await account.save();
  }

  return account;
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

  if (error instanceof CoinGeckoProviderError) {
    return new AppError({
      message: error.message,
      statusCode: error.status,
      code: error.code,
      details: error.details,
    });
  }

  if (error instanceof FinnhubProviderError) {
    return new AppError({
      message: error.message,
      statusCode: error.status,
      code: error.code,
      details: error.details,
    });
  }

  if (error instanceof FxProviderError) {
    return new AppError({
      message: error.message,
      statusCode: error.status,
      code: error.code,
      details: error.details,
    });
  }

  return error;
};

const fetchCryptoPricesMap = async (coinIds) => {
  const uniqueCoinIds = [
    ...new Set(coinIds.map((coinId) => String(coinId || '').trim().toLowerCase()).filter(Boolean)),
  ];

  if (uniqueCoinIds.length === 0 || !isCoinGeckoConfigured()) {
    return {};
  }

  return getSimplePrices(uniqueCoinIds, INVEST_PRICING_VS);
};

const getUsdToEurRate = async () => {
  const conversion = await convert({
    from: 'USD',
    to: 'EUR',
    amount: 1,
  });

  if (typeof conversion?.result !== 'number' || !Number.isFinite(conversion.result)) {
    throw new AppError({
      message: 'Unable to convert USD to EUR for stock valuation.',
      statusCode: 502,
      code: 'FX_PROVIDER_ERROR',
    });
  }

  return conversion.result;
};

const fetchStockQuotesMap = async (symbols) => {
  const uniqueSymbols = [
    ...new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean)),
  ];

  if (uniqueSymbols.length === 0 || !isFinnhubConfigured()) {
    return {};
  }

  const usdToEurRate = await getUsdToEurRate();
  const settledQuotes = await Promise.allSettled(uniqueSymbols.map((symbol) => getQuote(symbol)));
  const quotesMap = {};

  settledQuotes.forEach((result, index) => {
    const symbol = uniqueSymbols[index];

    if (result.status !== 'fulfilled') {
      return;
    }

    const quote = result.value;

    if (typeof quote?.price !== 'number' || !Number.isFinite(quote.price)) {
      return;
    }

    quotesMap[symbol] = {
      price: quote.price * usdToEurRate,
      change24h: typeof quote.changePct === 'number' ? quote.changePct : null,
    };
  });

  return quotesMap;
};

const enrichHoldings = (holdings, { cryptoPricesMap, stockQuotesMap }) => {
  const enriched = holdings.map((holding) => {
    const cryptoQuote = holding.coinId ? cryptoPricesMap[holding.coinId] ?? null : null;
    const stockQuote = stockQuotesMap[holding.symbol] ?? null;
    const quote = holding.assetType === 'stock' ? stockQuote : cryptoQuote;
    const currentPrice = quote?.price ?? 0;
    const change24h = typeof quote?.change24h === 'number' ? quote.change24h : null;
    const marketValue = holding.quantity * currentPrice;
    const unrealizedPnL = (currentPrice - holding.avgCost) * holding.quantity;

    return {
      id: holding._id.toString(),
      assetType: holding.assetType,
      coinId: holding.coinId ?? null,
      symbol: holding.symbol,
      quantity: toNumber(holding.quantity),
      avgCost: toNumber(holding.avgCost),
      currentPrice: toNumber(currentPrice),
      change24h: typeof change24h === 'number' ? toNumber(change24h, 4) : null,
      marketValue: toNumber(marketValue),
      unrealizedPnL: toNumber(unrealizedPnL),
      allocationPct: 0,
      createdAt: holding.createdAt?.toISOString?.() ?? null,
      updatedAt: holding.updatedAt?.toISOString?.() ?? null,
    };
  });

  const holdingsValue = enriched.reduce((sum, holding) => sum + holding.marketValue, 0);

  const withAllocation = enriched
    .map((holding) => ({
      ...holding,
      allocationPct: holdingsValue > 0 ? toNumber((holding.marketValue / holdingsValue) * 100, 4) : 0,
    }))
    .sort((left, right) => right.marketValue - left.marketValue);

  return {
    holdings: withAllocation,
    holdingsValue: toNumber(holdingsValue),
    unrealizedPnL: toNumber(withAllocation.reduce((sum, item) => sum + item.unrealizedPnL, 0)),
  };
};

const buildPortfolioSummary = async ({ account, holdings }) => {
  const cryptoCoinIds = holdings
    .filter((holding) => holding.assetType === 'crypto')
    .map((holding) => holding.coinId)
    .filter(Boolean);
  const stockSymbols = holdings
    .filter((holding) => holding.assetType === 'stock')
    .map((holding) => holding.symbol)
    .filter(Boolean);

  const [cryptoPricesMap, stockQuotesMap] = await Promise.all([
    fetchCryptoPricesMap(cryptoCoinIds),
    fetchStockQuotesMap(stockSymbols),
  ]);

  const { holdings: enrichedHoldings, holdingsValue, unrealizedPnL } = enrichHoldings(holdings, {
    cryptoPricesMap,
    stockQuotesMap,
  });
  const cashBalance = toNumber(account.cashBalance);
  const totalValue = toNumber(cashBalance + holdingsValue);

  return {
    holdings: enrichedHoldings,
    totals: {
      cashBalance,
      holdingsValue,
      totalValue,
      unrealizedPnL,
      holdingsCount: enrichedHoldings.length,
    },
  };
};

const upsertDailySnapshot = async ({ userId, totals }) => {
  const date = toIsoDay();

  await PortfolioSnapshot.findOneAndUpdate(
    {
      userId,
      date,
    },
    {
      $set: {
        totalValue: totals.totalValue,
        cashBalance: totals.cashBalance,
        holdingsValue: totals.holdingsValue,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );
};

investRouter.get('/account', requireAuth, async (req, res, next) => {
  try {
    const account = await ensurePortfolioAccount(req.authUser);

    sendSuccess(res, {
      account: serializeAccount(account),
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

investRouter.get('/holdings', requireAuth, async (req, res, next) => {
  try {
    const account = await ensurePortfolioAccount(req.authUser);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
    });

    const summary = await buildPortfolioSummary({
      account,
      holdings,
    });

    await upsertDailySnapshot({
      userId: req.authUser._id,
      totals: summary.totals,
    });

    sendSuccess(res, {
      account: serializeAccount(account),
      holdings: summary.holdings,
      totals: summary.totals,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

investRouter.get(
  '/trades',
  requireAuth,
  validateRequest({ query: investTradesQuerySchema }),
  async (req, res, next) => {
    try {
      const trades = await PortfolioTrade.find({
        userId: req.authUser._id,
      })
        .sort({ createdAt: -1 })
        .limit(req.query.limit);

      sendSuccess(
        res,
        {
          trades: trades.map(serializeTrade),
        },
        200,
        {
          returned: trades.length,
          limit: req.query.limit,
        },
      );
    } catch (error) {
      next(error);
    }
  },
);

investRouter.get(
  '/funding',
  requireAuth,
  validateRequest({ query: investFundingQuerySchema }),
  async (req, res, next) => {
    try {
      const fundingEntries = await InvestFunding.find({
        userId: req.authUser._id,
      })
        .sort({ createdAt: -1 })
        .limit(req.query.limit);

      sendSuccess(
        res,
        {
          funding: fundingEntries.map(serializeFunding),
        },
        200,
        {
          returned: fundingEntries.length,
          limit: req.query.limit,
        },
      );
    } catch (error) {
      next(error);
    }
  },
);

investRouter.get(
  '/topup/quote',
  requireAuth,
  validateRequest({ query: investTopUpQuoteQuerySchema }),
  async (req, res, next) => {
    try {
      const quote = await convert({
        from: req.query.fromCurrency,
        to: INVEST_BASE_CURRENCY,
        amount: req.query.amount,
      });

      sendSuccess(res, {
        fromCurrency: 'RON',
        fromAmount: toNumber(req.query.amount),
        toCurrency: INVEST_BASE_CURRENCY,
        estimatedEUR: toNumber(quote.result),
        rate: toNumber(quote.rate, 10),
        provider: quote.provider,
        date: quote.date,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investRouter.post(
  '/topup',
  requireAuth,
  validateRequest({ body: investTopUpSchema }),
  async (req, res, next) => {
    try {
      const account = await ensurePortfolioAccount(req.authUser);
      const conversion = await convert({
        from: req.body.fromCurrency,
        to: INVEST_BASE_CURRENCY,
        amount: req.body.amount,
      });

      const addedEUR = toNumber(conversion.result);

      account.cashBalance = toNumber(account.cashBalance + addedEUR);
      await account.save();

      await InvestFunding.create({
        userId: req.authUser._id,
        fromCurrency: 'RON',
        fromAmount: req.body.amount,
        toCurrency: INVEST_BASE_CURRENCY,
        toAmount: addedEUR,
        rate: toNumber(conversion.rate, 10),
        provider: 'frankfurter',
      });

      const refreshedHoldings = await PortfolioHolding.find({
        userId: req.authUser._id,
      });
      const summary = await buildPortfolioSummary({
        account,
        holdings: refreshedHoldings,
      });

      await upsertDailySnapshot({
        userId: req.authUser._id,
        totals: summary.totals,
      });

      sendSuccess(res, {
        cashBalanceEUR: toNumber(account.cashBalance),
        addedEUR,
        rate: toNumber(conversion.rate, 10),
        fromAmountRON: toNumber(req.body.amount),
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investRouter.get(
  '/snapshots',
  requireAuth,
  validateRequest({ query: investSnapshotsQuerySchema }),
  async (req, res, next) => {
    try {
      const { days } = req.query;
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - days + 1);
      const fromDay = toIsoDay(startDate);

      const snapshots = await PortfolioSnapshot.find({
        userId: req.authUser._id,
        date: {
          $gte: fromDay,
        },
      }).sort({ date: 1 });

      sendSuccess(
        res,
        {
          snapshots: snapshots.map(serializeSnapshot),
        },
        200,
        {
          returned: snapshots.length,
          fromDay,
          days,
        },
      );
    } catch (error) {
      next(error);
    }
  },
);

investRouter.post('/reset', requireAuth, async (req, res, next) => {
  try {
    const account = await ensurePortfolioAccount(req.authUser);

    await Promise.all([
      PortfolioHolding.deleteMany({
        userId: req.authUser._id,
      }),
      PortfolioTrade.deleteMany({
        userId: req.authUser._id,
      }),
      PortfolioSnapshot.deleteMany({
        userId: req.authUser._id,
      }),
    ]);

    account.cashBalance = STARTING_CASH_BALANCE;
    account.baseCurrency = INVEST_BASE_CURRENCY;
    await account.save();

    const totals = {
      cashBalance: toNumber(account.cashBalance),
      holdingsValue: 0,
      totalValue: toNumber(account.cashBalance),
      unrealizedPnL: 0,
      holdingsCount: 0,
    };

    await upsertDailySnapshot({
      userId: req.authUser._id,
      totals,
    });

    sendSuccess(res, {
      account: serializeAccount(account),
      totals,
    });
  } catch (error) {
    next(error);
  }
});

investRouter.post(
  '/order',
  requireAuth,
  validateRequest({ body: investOrderSchema }),
  async (req, res, next) => {
    try {
      assertCoinGeckoAvailable();

      const { coinId, symbol, side, quantity } = req.body;
      const account = await ensurePortfolioAccount(req.authUser);
      const pricesMap = await getSimplePrices([coinId], INVEST_PRICING_VS);
      const quote = pricesMap[coinId];

      if (!quote || typeof quote.price !== 'number') {
        throw new AppError({
          message: 'Unable to fetch a live quote for this asset right now.',
          statusCode: 502,
          code: 'QUOTE_UNAVAILABLE',
        });
      }

      const executionPrice = quote.price;
      const orderTotal = quantity * executionPrice;
      const roundedOrderTotal = toNumber(orderTotal);

      let holding = await PortfolioHolding.findOne({
        userId: req.authUser._id,
        assetType: 'crypto',
        coinId,
      });

      if (side === 'buy') {
        if (account.cashBalance < roundedOrderTotal) {
          throw new AppError({
            message: 'Insufficient buying power for this order.',
            statusCode: 400,
            code: 'INSUFFICIENT_FUNDS',
          });
        }

        if (!holding) {
          holding = await PortfolioHolding.create({
            userId: req.authUser._id,
            assetType: 'crypto',
            coinId,
            symbol,
            quantity,
            avgCost: executionPrice,
          });
        } else {
          const nextQuantity = holding.quantity + quantity;
          const nextAvgCost =
            (holding.quantity * holding.avgCost + quantity * executionPrice) / nextQuantity;

          holding.quantity = toNumber(nextQuantity);
          holding.avgCost = toNumber(nextAvgCost);
          await holding.save();
        }

        account.cashBalance = toNumber(account.cashBalance - roundedOrderTotal);
      }

      if (side === 'sell') {
        if (!holding || holding.quantity < quantity) {
          throw new AppError({
            message: 'Insufficient quantity available to sell.',
            statusCode: 400,
            code: 'INSUFFICIENT_HOLDINGS',
          });
        }

        const nextQuantity = toNumber(holding.quantity - quantity);

        if (nextQuantity <= MIN_HOLDING_QUANTITY) {
          await PortfolioHolding.deleteOne({
            _id: holding._id,
          });
          holding = null;
        } else {
          holding.quantity = nextQuantity;
          await holding.save();
        }

        account.cashBalance = toNumber(account.cashBalance + roundedOrderTotal);
      }

      await account.save();

      const trade = await PortfolioTrade.create({
        userId: req.authUser._id,
        assetType: 'crypto',
        coinId,
        symbol,
        side,
        quantity,
        price: executionPrice,
        total: roundedOrderTotal,
      });

      const refreshedHoldings = await PortfolioHolding.find({
        userId: req.authUser._id,
      });

      const summary = await buildPortfolioSummary({
        account,
        holdings: refreshedHoldings,
      });

      await upsertDailySnapshot({
        userId: req.authUser._id,
        totals: summary.totals,
      });

      sendSuccess(res, {
        trade: serializeTrade(trade),
        account: serializeAccount(account),
        holdingsSummary: summary.totals,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investRouter.post(
  '/stocks/order',
  requireAuth,
  validateRequest({ body: investStockOrderSchema }),
  async (req, res, next) => {
    try {
      assertFinnhubAvailable();

      const { symbol, side, quantity } = req.body;
      const account = await ensurePortfolioAccount(req.authUser);
      const stockQuote = await getQuote(symbol);

      if (typeof stockQuote?.price !== 'number' || !Number.isFinite(stockQuote.price)) {
        throw new AppError({
          message: 'Unable to fetch a live quote for this stock right now.',
          statusCode: 502,
          code: 'QUOTE_UNAVAILABLE',
        });
      }

      const usdToEurRate = await getUsdToEurRate();
      const executionPrice = stockQuote.price * usdToEurRate;
      const orderTotal = quantity * executionPrice;
      const roundedOrderTotal = toNumber(orderTotal);

      let holding = await PortfolioHolding.findOne({
        userId: req.authUser._id,
        assetType: 'stock',
        symbol,
      });

      if (side === 'buy') {
        if (account.cashBalance < roundedOrderTotal) {
          throw new AppError({
            message: 'Insufficient buying power for this order.',
            statusCode: 400,
            code: 'INSUFFICIENT_FUNDS',
          });
        }

        if (!holding) {
          holding = await PortfolioHolding.create({
            userId: req.authUser._id,
            assetType: 'stock',
            symbol,
            coinId: null,
            quantity,
            avgCost: executionPrice,
          });
        } else {
          const nextQuantity = holding.quantity + quantity;
          const nextAvgCost =
            (holding.quantity * holding.avgCost + quantity * executionPrice) / nextQuantity;

          holding.quantity = toNumber(nextQuantity);
          holding.avgCost = toNumber(nextAvgCost);
          await holding.save();
        }

        account.cashBalance = toNumber(account.cashBalance - roundedOrderTotal);
      }

      if (side === 'sell') {
        if (!holding || holding.quantity < quantity) {
          throw new AppError({
            message: 'Insufficient quantity available to sell.',
            statusCode: 400,
            code: 'INSUFFICIENT_HOLDINGS',
          });
        }

        const nextQuantity = toNumber(holding.quantity - quantity);

        if (nextQuantity <= MIN_HOLDING_QUANTITY) {
          await PortfolioHolding.deleteOne({ _id: holding._id });
          holding = null;
        } else {
          holding.quantity = nextQuantity;
          await holding.save();
        }

        account.cashBalance = toNumber(account.cashBalance + roundedOrderTotal);
      }

      await account.save();

      const trade = await PortfolioTrade.create({
        userId: req.authUser._id,
        assetType: 'stock',
        coinId: null,
        symbol,
        side,
        quantity,
        price: executionPrice,
        total: roundedOrderTotal,
      });

      const refreshedHoldings = await PortfolioHolding.find({
        userId: req.authUser._id,
      });

      const summary = await buildPortfolioSummary({
        account,
        holdings: refreshedHoldings,
      });

      await upsertDailySnapshot({
        userId: req.authUser._id,
        totals: summary.totals,
      });

      sendSuccess(res, {
        trade: serializeTrade(trade),
        account: serializeAccount(account),
        holdingsSummary: summary.totals,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

export { investRouter };
