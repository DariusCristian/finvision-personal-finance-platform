import { Router } from 'express';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { FxProviderError, convert, getLatestRates } from '../../integrations/fx/frankfurterClient.js';
import {
  FinnhubProviderError,
  getCandles,
  getCompanyProfile,
  getQuote,
  isFinnhubConfigured,
  searchSymbol,
} from '../../integrations/finnhub/finnhubClient.js';
import {
  fetchDailyHistory as fetchStooqDailyHistory,
  getCandlesByRange as getStooqCandlesByRange,
  StooqProviderError,
} from '../../integrations/stooq/stooqClient.js';
import { fetchYahooStockHistory } from '../../integrations/yahoo/yahooChartClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { InvestingWalletLedger } from '../../models/investing-wallet-ledger.js';
import { InvestingWallet } from '../../models/investing-wallet.js';
import { PortfolioAccount } from '../../models/portfolio-account.js';
import { PortfolioHolding } from '../../models/portfolio-holding.js';
import { PortfolioSnapshot } from '../../models/portfolio-snapshot.js';
import { PortfolioTrade } from '../../models/portfolio-trade.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess } from '../../utils/response.js';
import {
  marketStocksCandlesQuerySchema,
  marketStocksDemoBudgetSchema,
  marketStocksModeMutationSchema,
  marketStocksOrderSchema,
  marketStocksPerformanceQuerySchema,
  marketStocksProfileQuerySchema,
  marketStocksQuoteQuerySchema,
  marketStocksSearchQuerySchema,
  marketStocksTradesQuerySchema,
  marketTopUpFromWalletSchema,
} from '../../validation/market-stocks.js';

const marketStocksRouter = Router();

const STOCKS_ACCOUNT_TYPE = 'stocks';
const STOCKS_FUNDED_MODE = 'funded';
const STOCKS_DEMO_MODE = 'demo';
const STOCKS_DEFAULT_MODE = STOCKS_FUNDED_MODE;
const STOCKS_BASE_CURRENCY = 'EUR';
const STOCKS_PRICING_CURRENCY = 'EUR';
const MIN_HOLDING_QUANTITY = 0.00000001;
const WALLET_CURRENCY = 'RON';
const DAY_MS = 24 * 60 * 60 * 1000;
const PERFORMANCE_DAYS_BY_RANGE = {
  '7d': 7,
  '30d': 30,
};
const FUNDED_STARTING_STOCKS_CASH_BALANCE = 0;
const DEMO_STARTING_STOCKS_CASH_BALANCE = 5000;
const CANDLES_RESPONSE_CACHE_TTL_MS = env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 60 * 1000;
const ENABLE_FINNHUB_CANDLES_FALLBACK = env.ENABLE_FINNHUB_CANDLES_FALLBACK === true;
const CANDLE_RANGE_CONFIG = {
  '1D': { resolution: '15', windowDays: 2 },
  '1W': { resolution: '60', windowDays: 10 },
  '1M': { resolution: 'D', windowDays: 45 },
  '6M': { resolution: 'D', windowDays: 220 },
  '1Y': { resolution: 'D', windowDays: 400 },
  ALL: { resolution: 'D', windowDays: 5 * 365 },
};
const CANDLE_RANGE_DAY_LIMIT = {
  '1D': 2,
  '1W': 7,
  '1M': 30,
  '6M': 180,
  '1Y': 365,
  ALL: 365 * 5,
};
const candlesResponseCache = new Map();

const toNumber = (value, fractionDigits = 8) => Number(Number(value).toFixed(fractionDigits));
const toIsoDay = (date = new Date()) => date.toISOString().slice(0, 10);
const toMoney = (value) => toNumber(value, 2);
const toUnixTimestampSeconds = (value) => Math.floor(Number(value) / 1000);
const normalizeCandlesRange = (range) => (Object.hasOwn(CANDLE_RANGE_CONFIG, range) ? range : '1M');
const isStocksMode = (mode) => mode === STOCKS_FUNDED_MODE || mode === STOCKS_DEMO_MODE;
const resolveSelectedModeOrNull = (authUser) =>
  isStocksMode(authUser?.marketStocksMode) ? authUser.marketStocksMode : null;
const resolveActiveMode = (authUser) => resolveSelectedModeOrNull(authUser) ?? STOCKS_DEFAULT_MODE;
const getStartingCashBalanceForMode = (mode) =>
  mode === STOCKS_DEMO_MODE ? DEMO_STARTING_STOCKS_CASH_BALANCE : FUNDED_STARTING_STOCKS_CASH_BALANCE;
const logModeScopedAccount = ({ selectedMode, account, holdingsCount }) => {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  logger.info('market.stocks.mode_scoped_account', {
    selectedMode,
    accountType: account?.accountType ?? null,
    accountId: account?._id?.toString?.() ?? null,
    cashBalanceEUR: toMoney(account?.cashBalance ?? 0),
    holdingsCount,
  });
};
const toDayTimestampUtc = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const getCandlesCacheKey = (symbol, range) => `${String(symbol || '').trim().toUpperCase()}|${String(range || '').trim().toUpperCase()}`;
const getCachedCandlesResponse = ({ symbol, range }) => {
  const cacheKey = getCandlesCacheKey(symbol, range);
  const cacheEntry = candlesResponseCache.get(cacheKey);

  if (!cacheEntry) {
    return null;
  }

  if (cacheEntry.expiresAt <= Date.now()) {
    candlesResponseCache.delete(cacheKey);
    return null;
  }

  return cacheEntry.value;
};
const setCachedCandlesResponse = ({ symbol, range, value }) => {
  if (!value || !Array.isArray(value.series) || value.series.length === 0) {
    return;
  }

  candlesResponseCache.set(getCandlesCacheKey(symbol, range), {
    value,
    expiresAt: Date.now() + CANDLES_RESPONSE_CACHE_TTL_MS,
  });
};
const buildRangeDayTimestamps = (days) => {
  const today = new Date();
  const todayDayTimestamp = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return Array.from({ length: days }, (_item, index) => (
    todayDayTimestamp - ((days - 1 - index) * DAY_MS)
  ));
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

  if (error instanceof FinnhubProviderError) {
    return new AppError({
      message: error.message,
      statusCode: error.status,
      code: error.code,
      details: error.details,
    });
  }

  if (error instanceof StooqProviderError) {
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

const serializeAccount = (account) => ({
  id: account._id.toString(),
  accountType: account.accountType,
  mode: account.mode,
  cashBalance: toMoney(account.cashBalance),
  cashBalanceEUR: toMoney(account.cashBalance),
  baseCurrency: STOCKS_BASE_CURRENCY,
  pricingCurrency: STOCKS_PRICING_CURRENCY,
  createdAt: account.createdAt?.toISOString?.() ?? null,
  updatedAt: account.updatedAt?.toISOString?.() ?? null,
});

const serializeTrade = (trade) => ({
  id: trade._id.toString(),
  accountType: trade.accountType,
  mode: trade.mode,
  assetType: trade.assetType,
  coinId: trade.coinId,
  symbol: trade.symbol,
  side: trade.side,
  quantity: toNumber(trade.quantity),
  price: toMoney(trade.price),
  priceEUR: toMoney(trade.price),
  total: toMoney(trade.total),
  totalEUR: toMoney(trade.total),
  executedPriceOriginal:
    typeof trade.executedPriceOriginal === 'number' ? toNumber(trade.executedPriceOriginal) : null,
  originalCurrency: trade.originalCurrency ?? null,
  fxRateToEur: typeof trade.fxRateToEur === 'number' ? toNumber(trade.fxRateToEur, 10) : null,
  executedAt: trade.executedAt?.toISOString?.() ?? trade.createdAt?.toISOString?.() ?? null,
  createdAt: trade.createdAt?.toISOString?.() ?? null,
});

const ensureStocksAccount = async (authUser, mode = STOCKS_DEFAULT_MODE) => {
  let account = await PortfolioAccount.findOne({
    userId: authUser._id,
    accountType: STOCKS_ACCOUNT_TYPE,
    mode,
  });

  if (!account) {
    account = await PortfolioAccount.create({
      userId: authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode,
      baseCurrency: STOCKS_BASE_CURRENCY,
      cashBalance: getStartingCashBalanceForMode(mode),
    });

    return account;
  }

  if (account.baseCurrency !== STOCKS_BASE_CURRENCY) {
    account.baseCurrency = STOCKS_BASE_CURRENCY;
    await account.save();
  }

  return account;
};

const ensureStocksAccounts = async (authUser) => {
  const [funded, demo] = await Promise.all([
    ensureStocksAccount(authUser, STOCKS_FUNDED_MODE),
    ensureStocksAccount(authUser, STOCKS_DEMO_MODE),
  ]);

  return { funded, demo };
};

const ensureWallet = async (userId) => {
  let wallet = await InvestingWallet.findOne({ userId });

  if (!wallet) {
    wallet = await InvestingWallet.create({
      userId,
      currency: WALLET_CURRENCY,
      balance: 0,
      monthlyGoal: 0,
      autoFundEnabled: false,
      autoFundAmount: 0,
      autoFundDayOfMonth: 1,
      lastAutoFundAt: null,
    });
  }

  return wallet;
};

const getUsdToEurRate = async () => {
  const latestRates = await getLatestRates('USD', ['EUR']);
  const rate = Number(latestRates?.rates?.EUR);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new AppError({
      message: 'Unable to convert USD to EUR for stock valuation.',
      statusCode: 502,
      code: 'FX_PROVIDER_ERROR',
    });
  }

  return rate;
};

const buildDailyPriceResolver = ({ points, fallbackPrice }) => {
  const dailyPrices = new Map();

  [...points]
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.c))
    .sort((left, right) => left.t - right.t)
    .forEach((point) => {
      dailyPrices.set(toDayTimestampUtc(point.t), point.c);
    });

  const sortedDays = [...dailyPrices.keys()].sort((left, right) => left - right);

  return (targetDayTimestamp) => {
    if (dailyPrices.has(targetDayTimestamp)) {
      return dailyPrices.get(targetDayTimestamp);
    }

    let lastKnownPrice = null;

    for (const dayTimestamp of sortedDays) {
      if (dayTimestamp > targetDayTimestamp) {
        break;
      }

      lastKnownPrice = dailyPrices.get(dayTimestamp);
    }

    if (typeof lastKnownPrice === 'number') {
      return lastKnownPrice;
    }

    for (const dayTimestamp of sortedDays) {
      if (dayTimestamp >= targetDayTimestamp) {
        const nearestPrice = dailyPrices.get(dayTimestamp);

        if (typeof nearestPrice === 'number') {
          return nearestPrice;
        }
      }
    }

    return fallbackPrice;
  };
};

const buildFlatPerformanceSeries = ({ days, cashBalanceEUR }) =>
  buildRangeDayTimestamps(days).map((dayTimestamp) => ({
    t: dayTimestamp,
    value: toNumber(cashBalanceEUR, 2),
  }));

const buildSyntheticCandlesFromQuotePrice = ({ price, range, symbol }) => {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return [];
  }

  const days = CANDLE_RANGE_DAY_LIMIT[range] ?? CANDLE_RANGE_DAY_LIMIT['1M'];
  const pointsCount = Math.max(2, days + Math.max(4, Math.floor(days * 0.5)));
  const today = new Date();
  const todayUtcMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const seedText = String(symbol || '').toUpperCase();
  let hash = 0;

  for (let index = 0; index < seedText.length; index += 1) {
    hash = ((hash << 5) - hash + seedText.charCodeAt(index)) | 0;
  }

  let state = (Math.abs(hash) % 2147483647) || 1;
  const nextRandom = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  const denominator = Math.max(pointsCount - 1, 1);
  const baseVolatilityPct = 0.004 + ((Math.abs(hash) % 6) * 0.0011);
  const driftPerStep = ((nextRandom() - 0.5) * 0.018) / denominator;
  const primaryCycles = 2 + (Math.abs(hash) % 4);
  const phaseShift = ((Math.abs(hash) % 360) * Math.PI) / 180;
  let runningPrice = numericPrice * (0.96 + (nextRandom() * 0.08));

  const rawSeries = Array.from({ length: pointsCount }, (_value, index) => {
    const progress = index / denominator;
    const wave = Math.sin((progress * Math.PI * 2 * primaryCycles) + phaseShift) * baseVolatilityPct * 0.36;
    const noise = (nextRandom() - 0.5) * 2 * baseVolatilityPct;
    const stepReturn = driftPerStep + wave + noise;
    runningPrice = Math.max(0.01, runningPrice * (1 + stepReturn));

    return {
      t: todayUtcMs - ((pointsCount - 1 - index) * DAY_MS),
      c: runningPrice,
    };
  });

  const lastPrice = rawSeries[rawSeries.length - 1]?.c ?? numericPrice;
  const adjustmentFactor = numericPrice / Math.max(lastPrice, 0.01);

  return rawSeries
    .map((point) => ({
      t: point.t,
      c: toNumber(point.c * adjustmentFactor, 4),
    }))
    .slice(-Math.max(2, days));
};

const getStockCandlesByRange = async (symbol, range) => {
  const normalizedRange = normalizeCandlesRange(range);
  const cachedResponse = getCachedCandlesResponse({
    symbol,
    range: normalizedRange,
  });

  if (cachedResponse) {
    return {
      ...cachedResponse,
      fromCache: true,
    };
  }

  try {
    const stooqResult = await fetchStooqDailyHistory(symbol, {
      range: normalizedRange,
      limitDays: CANDLE_RANGE_DAY_LIMIT[normalizedRange] ?? CANDLE_RANGE_DAY_LIMIT['1M'],
    });
    const stooqSeries = Array.isArray(stooqResult.series) ? stooqResult.series : [];
    const stooqMeta = stooqResult.providerMeta ?? {};
    const stooqStatus = stooqMeta.status === 'ok' ? 'ok' : 'no_data';

    const stooqPayload = {
      provider: 'stooq',
      series: stooqSeries,
      status: stooqStatus,
      reason: stooqStatus === 'ok' ? null : 'NO_DATA_FOR_RANGE',
      range: normalizedRange,
      finnhubStatus: null,
      requestUrlWithoutToken: stooqMeta.requestUrlWithoutSensitive ?? null,
      requestUrlsWithoutToken: stooqMeta.requestUrlsWithoutSensitive ?? [],
      rawResponseFirst200Chars: stooqMeta.rawResponseFirst200Chars ?? '',
      stooqSymbol: stooqMeta.stooqSymbol ?? null,
    };

    if (stooqMeta.source === 'quote_fallback') {
      try {
        const yahooResult = await fetchYahooStockHistory(symbol, normalizedRange);

        if (Array.isArray(yahooResult.series) && yahooResult.series.length > 0) {
          const yahooPayload = {
            provider: 'yahoo',
            series: yahooResult.series,
            status: 'fallback',
            reason: 'STOOQ_QUOTE_FALLBACK',
            range: normalizedRange,
            finnhubStatus: null,
            requestUrlWithoutToken: yahooResult.requestUrlWithoutSensitive ?? null,
            requestUrlsWithoutToken: yahooResult.requestUrlWithoutSensitive
              ? [yahooResult.requestUrlWithoutSensitive]
              : [],
            rawResponseFirst200Chars: yahooResult.rawResponseFirst200Chars ?? '',
            stooqSymbol: stooqMeta.stooqSymbol ?? null,
          };

          setCachedCandlesResponse({
            symbol,
            range: normalizedRange,
            value: yahooPayload,
          });

          if (env.NODE_ENV === 'development') {
            logger.info('market.stocks.candles.fallback_used', {
              symbol: String(symbol || '').trim().toUpperCase(),
              range: normalizedRange,
              provider: 'yahoo',
              reason: 'STOOQ_QUOTE_FALLBACK',
            });
          }

          return yahooPayload;
        }
      } catch {
        // Keep Stooq quote fallback series if Yahoo is unavailable.
      }
    }

    if (stooqPayload.status === 'no_data') {
      try {
        const yahooResult = await fetchYahooStockHistory(symbol, normalizedRange);

        if (Array.isArray(yahooResult.series) && yahooResult.series.length > 0) {
          const yahooPayload = {
            provider: 'yahoo',
            series: yahooResult.series,
            status: 'fallback',
            reason: 'STOOQ_NO_DATA',
            range: normalizedRange,
            finnhubStatus: null,
            requestUrlWithoutToken: yahooResult.requestUrlWithoutSensitive ?? null,
            requestUrlsWithoutToken: yahooResult.requestUrlWithoutSensitive
              ? [yahooResult.requestUrlWithoutSensitive]
              : [],
            rawResponseFirst200Chars: yahooResult.rawResponseFirst200Chars ?? '',
            stooqSymbol: stooqMeta.stooqSymbol ?? null,
          };

          setCachedCandlesResponse({
            symbol,
            range: normalizedRange,
            value: yahooPayload,
          });

          if (env.NODE_ENV === 'development') {
            logger.info('market.stocks.candles.fallback_used', {
              symbol: String(symbol || '').trim().toUpperCase(),
              range: normalizedRange,
              provider: 'yahoo',
              reason: 'STOOQ_NO_DATA',
            });
          }

          return yahooPayload;
        }
      } catch {
        // Continue to quote fallback.
      }

      try {
        const quote = await getQuote(symbol);
        const syntheticSeries = buildSyntheticCandlesFromQuotePrice({
          price: quote?.price,
          range: normalizedRange,
          symbol,
        });

        if (syntheticSeries.length > 0) {
          const quoteFallbackPayload = {
            provider: 'finnhub_quote',
            series: syntheticSeries,
            status: 'fallback',
            reason: 'STOOQ_NO_DATA',
            range: normalizedRange,
            finnhubStatus: null,
            requestUrlWithoutToken: null,
            requestUrlsWithoutToken: [],
            rawResponseFirst200Chars: null,
            stooqSymbol: null,
          };

          setCachedCandlesResponse({
            symbol,
            range: normalizedRange,
            value: quoteFallbackPayload,
          });

          if (env.NODE_ENV === 'development') {
            logger.info('market.stocks.candles.fallback_used', {
              symbol: String(symbol || '').trim().toUpperCase(),
              range: normalizedRange,
              provider: 'finnhub_quote',
              reason: 'STOOQ_NO_DATA',
            });
          }

          return quoteFallbackPayload;
        }
      } catch {
        // Keep default no_data response when quote fallback is unavailable.
      }
    }

    setCachedCandlesResponse({
      symbol,
      range: normalizedRange,
      value: stooqPayload,
    });

    return stooqPayload;
  } catch (stooqError) {
    try {
      const yahooResult = await fetchYahooStockHistory(symbol, normalizedRange);

      if (Array.isArray(yahooResult.series) && yahooResult.series.length > 0) {
        const yahooPayload = {
          provider: 'yahoo',
          series: yahooResult.series,
          status: 'fallback',
          reason: 'STOOQ_PROVIDER_ERROR',
          range: normalizedRange,
          finnhubStatus: null,
          requestUrlWithoutToken: yahooResult.requestUrlWithoutSensitive ?? null,
          requestUrlsWithoutToken: yahooResult.requestUrlWithoutSensitive
            ? [yahooResult.requestUrlWithoutSensitive]
            : [],
          rawResponseFirst200Chars: yahooResult.rawResponseFirst200Chars ?? '',
          stooqSymbol: null,
        };

        setCachedCandlesResponse({
          symbol,
          range: normalizedRange,
          value: yahooPayload,
        });

        if (env.NODE_ENV === 'development') {
          logger.info('market.stocks.candles.fallback_used', {
            symbol: String(symbol || '').trim().toUpperCase(),
            range: normalizedRange,
            provider: 'yahoo',
            reason: 'STOOQ_PROVIDER_ERROR',
          });
        }

        return yahooPayload;
      }
    } catch {
      // Continue to quote fallback.
    }

    if (isFinnhubConfigured()) {
      try {
        const quote = await getQuote(symbol);
        const syntheticSeries = buildSyntheticCandlesFromQuotePrice({
          price: quote?.price,
          range: normalizedRange,
          symbol,
        });

        if (syntheticSeries.length > 0) {
          const quoteFallbackPayload = {
            provider: 'finnhub_quote',
            series: syntheticSeries,
            status: 'fallback',
            reason: 'STOOQ_NO_DATA',
            range: normalizedRange,
            finnhubStatus: null,
            requestUrlWithoutToken: null,
            requestUrlsWithoutToken: [],
            rawResponseFirst200Chars: null,
            stooqSymbol: null,
          };

          setCachedCandlesResponse({
            symbol,
            range: normalizedRange,
            value: quoteFallbackPayload,
          });

          if (env.NODE_ENV === 'development') {
            logger.info('market.stocks.candles.fallback_used', {
              symbol: String(symbol || '').trim().toUpperCase(),
              range: normalizedRange,
              provider: 'finnhub_quote',
              reason: 'STOOQ_NO_DATA',
            });
          }

          return quoteFallbackPayload;
        }
      } catch {
        // Keep default no_data response when quote fallback is unavailable.
      }
    }

    if (ENABLE_FINNHUB_CANDLES_FALLBACK && isFinnhubConfigured()) {
      const rangeConfig = CANDLE_RANGE_CONFIG[normalizedRange] ?? CANDLE_RANGE_CONFIG['1M'];
      const nowMs = Date.now();
      const to = toUnixTimestampSeconds(nowMs);
      const from = toUnixTimestampSeconds(nowMs - (rangeConfig.windowDays * DAY_MS));
      let finnhubResult = null;
      let finnhubError = null;

      try {
        finnhubResult = await getCandles(symbol, rangeConfig.resolution, from, to);
      } catch (error) {
        finnhubError = error;
      }

      if (
        finnhubResult?.status === 'ok'
        && Array.isArray(finnhubResult.series)
        && finnhubResult.series.length > 0
      ) {
        const finnhubPayload = {
          provider: 'finnhub',
          series: finnhubResult.series,
          status: 'fallback',
          reason: 'STOOQ_PROVIDER_ERROR',
          range: normalizedRange,
          finnhubStatus: finnhubResult.finnhubStatus ?? null,
          requestUrlWithoutToken: finnhubResult.requestUrlWithoutToken ?? null,
          requestUrlsWithoutToken: finnhubResult.requestUrlWithoutToken
            ? [finnhubResult.requestUrlWithoutToken]
            : [],
          rawResponseFirst200Chars: null,
          stooqSymbol: null,
        };

        setCachedCandlesResponse({
          symbol,
          range: normalizedRange,
          value: finnhubPayload,
        });

        if (env.NODE_ENV === 'development') {
          logger.info('market.stocks.candles.fallback_used', {
            symbol: String(symbol || '').trim().toUpperCase(),
            range: normalizedRange,
            provider: 'finnhub',
            reason: 'STOOQ_PROVIDER_ERROR',
          });
        }

        return finnhubPayload;
      }

      throw new AppError({
        message: 'Stock chart history is temporarily unavailable. Please try again shortly.',
        statusCode: 502,
        code: 'MARKET_HISTORY_UNAVAILABLE',
        details: [
          {
            reason: 'ALL_PROVIDERS_UNAVAILABLE',
            symbol: String(symbol || '').trim().toUpperCase(),
            range: normalizedRange,
            stooqErrorCode: stooqError instanceof StooqProviderError ? stooqError.code : null,
            finnhubErrorCode: finnhubError instanceof FinnhubProviderError ? finnhubError.code : null,
            finnhubStatus: finnhubResult?.finnhubStatus ?? null,
          },
        ],
      });
    }

    throw new AppError({
      message: 'Stock chart history is temporarily unavailable. Please try again shortly.',
      statusCode: 502,
      code: 'MARKET_HISTORY_UNAVAILABLE',
      details: [
        {
          reason: 'STOOQ_PROVIDER_ERROR',
          symbol: String(symbol || '').trim().toUpperCase(),
          range: normalizedRange,
          stooqErrorCode: stooqError instanceof StooqProviderError ? stooqError.code : null,
        },
      ],
    });
  }
};

const fetchStockExecutionQuote = async (symbol) => {
  assertFinnhubAvailable();

  const stockQuote = await getQuote(symbol);

  if (typeof stockQuote?.price !== 'number' || !Number.isFinite(stockQuote.price)) {
    throw new AppError({
      message: 'Unable to fetch a live quote for this stock right now.',
      statusCode: 502,
      code: 'QUOTE_UNAVAILABLE',
    });
  }

  const usdToEurRate = await getUsdToEurRate();

  return {
    symbol,
    priceUSD: toNumber(stockQuote.price),
    priceEUR: toNumber(stockQuote.price * usdToEurRate),
    usdToEurRate: toNumber(usdToEurRate, 10),
    changePct: typeof stockQuote.changePct === 'number' ? stockQuote.changePct : null,
  };
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
      priceEUR: quote.price * usdToEurRate,
      priceUSD: quote.price,
      change24h: typeof quote.changePct === 'number' ? quote.changePct : null,
    };
  });

  return quotesMap;
};

const buildStocksSummary = async ({ account, holdings }) => {
  const stockSymbols = holdings.map((holding) => holding.symbol).filter(Boolean);
  const stockQuotesMap = await fetchStockQuotesMap(stockSymbols);

  const enriched = holdings
    .map((holding) => {
      const quote = stockQuotesMap[holding.symbol] ?? null;
      const currentPrice = quote?.priceEUR ?? 0;
      const change24h = typeof quote?.change24h === 'number' ? quote.change24h : null;
      const marketValue = holding.quantity * currentPrice;
      const unrealizedPnL = (currentPrice - holding.avgCost) * holding.quantity;

      return {
        id: holding._id.toString(),
        accountType: holding.accountType,
        mode: holding.mode,
        assetType: holding.assetType,
        coinId: holding.coinId ?? null,
        symbol: holding.symbol,
        name: holding.name ?? null,
        quantity: toNumber(holding.quantity),
        avgCost: toNumber(holding.avgCost),
        avgCostEUR: toNumber(holding.avgCost),
        currentPrice: toNumber(currentPrice),
        marketPriceEUR: toNumber(currentPrice),
        change24h: typeof change24h === 'number' ? toNumber(change24h, 4) : null,
        changePct24h: typeof change24h === 'number' ? toNumber(change24h, 4) : null,
        marketValue: toNumber(marketValue),
        marketValueEUR: toNumber(marketValue),
        unrealizedPnL: toNumber(unrealizedPnL),
        allocationPct: 0,
        createdAt: holding.createdAt?.toISOString?.() ?? null,
        updatedAt: holding.updatedAt?.toISOString?.() ?? null,
      };
    })
    .sort((left, right) => right.marketValue - left.marketValue);

  const holdingsValue = enriched.reduce((sum, holding) => sum + holding.marketValue, 0);
  const withAllocation = enriched.map((holding) => ({
    ...holding,
    allocationPct: holdingsValue > 0 ? toNumber((holding.marketValue / holdingsValue) * 100, 4) : 0,
  }));

  const cashBalance = toNumber(account.cashBalance);
  const totalValue = toNumber(cashBalance + holdingsValue);
  const previousHoldingsValue = withAllocation.reduce((sum, item) => {
    const changePct = typeof item.change24h === 'number' ? item.change24h : null;

    if (changePct === null) {
      return sum + item.marketValue;
    }

    const factor = 1 + (changePct / 100);

    if (!Number.isFinite(factor) || Math.abs(factor) < 0.000001) {
      return sum + item.marketValue;
    }

    return sum + (item.marketValue / factor);
  }, 0);
  const previousPortfolioValue = cashBalance + previousHoldingsValue;
  const dayPnL = holdingsValue - previousHoldingsValue;
  const dayPnLPct = previousPortfolioValue > 0 ? (dayPnL / previousPortfolioValue) * 100 : 0;

  return {
    holdings: withAllocation,
    totals: {
      cashBalance,
      cashBalanceEUR: cashBalance,
      holdingsValue: toNumber(holdingsValue),
      holdingsValueEUR: toNumber(holdingsValue),
      totalValue,
      portfolioValueEUR: totalValue,
      dayPnL: toNumber(dayPnL, 2),
      dayPnLPct: toNumber(dayPnLPct, 4),
      unrealizedPnL: toNumber(withAllocation.reduce((sum, item) => sum + item.unrealizedPnL, 0)),
      holdingsCount: withAllocation.length,
    },
  };
};

const computeAllocation = ({ holdingsSummary }) => {
  const stocksValue = holdingsSummary.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const cashValue = holdingsSummary.totals.cashBalance;
  const total = toNumber(stocksValue + cashValue);

  const breakdown = [
    {
      label: 'Stocks',
      value: toNumber(stocksValue),
      pct: total > 0 ? toNumber((stocksValue / total) * 100, 4) : 0,
    },
    {
      label: 'Cash',
      value: toNumber(cashValue),
      pct: total > 0 ? toNumber((cashValue / total) * 100, 4) : 0,
    },
  ];

  const topHoldings = holdingsSummary.holdings
    .slice()
    .sort((left, right) => right.marketValue - left.marketValue)
    .slice(0, 4)
    .map((holding) => ({
      id: holding.id,
      symbol: holding.symbol,
      value: holding.marketValue,
      pctOfAssets:
        stocksValue > 0 ? toNumber((holding.marketValue / stocksValue) * 100, 4) : 0,
      pctOfTotal: total > 0 ? toNumber((holding.marketValue / total) * 100, 4) : 0,
    }));

  return {
    accountType: STOCKS_ACCOUNT_TYPE,
    total,
    breakdown,
    topHoldings,
  };
};

const computePerformanceSeries = async ({ account, holdings, range }) => {
  const days = PERFORMANCE_DAYS_BY_RANGE[range] ?? PERFORMANCE_DAYS_BY_RANGE['7d'];
  const dayTimestamps = buildRangeDayTimestamps(days);
  const cashBalanceEUR = typeof account.cashBalance === 'number' ? account.cashBalance : 0;
  const stockHoldings = holdings.filter((holding) => holding.assetType === 'stock' && holding.symbol);

  if (stockHoldings.length === 0) {
    return {
      range,
      series: buildFlatPerformanceSeries({ days, cashBalanceEUR }),
      meta: {
        points: days,
        symbols: [],
      },
    };
  }

  const usdToEurRate = await getUsdToEurRate();
  const candlesBySymbol = {};

  await Promise.all(
    stockHoldings.map(async (holding) => {
      const symbol = String(holding.symbol).trim().toUpperCase();

      try {
        const candlesPayload = await getStooqCandlesByRange(symbol, 'ALL');
        candlesBySymbol[symbol] = Array.isArray(candlesPayload.series) ? candlesPayload.series : [];
      } catch {
        candlesBySymbol[symbol] = [];
      }
    }),
  );

  const priceResolvers = stockHoldings.map((holding) => {
    const symbol = String(holding.symbol).trim().toUpperCase();
    const fallbackPriceEUR =
      typeof holding.avgCost === 'number' && Number.isFinite(holding.avgCost) ? holding.avgCost : 0;
    const pointsUsd = Array.isArray(candlesBySymbol[symbol]) ? candlesBySymbol[symbol] : [];
    const pointsEur = pointsUsd.map((point) => ({
      t: point.t,
      c: point.c * usdToEurRate,
    }));

    return {
      symbol,
      quantity: holding.quantity,
      resolvePrice: buildDailyPriceResolver({
        points: pointsEur,
        fallbackPrice: fallbackPriceEUR,
      }),
    };
  });

  const series = dayTimestamps.map((dayTimestamp) => {
    const holdingsValue = priceResolvers.reduce((sum, resolver) => (
      sum + (resolver.quantity * resolver.resolvePrice(dayTimestamp))
    ), 0);

    return {
      t: dayTimestamp,
      value: toNumber(cashBalanceEUR + holdingsValue, 2),
    };
  });

  return {
    range,
    series,
    meta: {
      points: series.length,
      symbols: [...new Set(priceResolvers.map((item) => item.symbol))],
    },
  };
};

const upsertDailySnapshot = async ({ userId, mode, totals }) => {
  const date = toIsoDay();

  await PortfolioSnapshot.findOneAndUpdate(
    {
      userId,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode,
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

const buildModeState = async (authUser, mode) => {
  const account = await ensureStocksAccount(authUser, mode);
  const holdings = await PortfolioHolding.find({
    userId: authUser._id,
    accountType: STOCKS_ACCOUNT_TYPE,
    mode,
    assetType: 'stock',
  });
  const tradesCount = await PortfolioTrade.countDocuments({
    userId: authUser._id,
    accountType: STOCKS_ACCOUNT_TYPE,
    mode,
    assetType: 'stock',
  });

  const summary = await buildStocksSummary({
    account,
    holdings,
  });

  return {
    cashBalanceEUR: summary.totals.cashBalanceEUR,
    totalValueEUR: summary.totals.portfolioValueEUR,
    holdingsCount: summary.totals.holdingsCount,
    tradesCount,
  };
};

const handleStockOrder = async (req, res, next) => {
  try {
    const { symbol, side, quantity } = req.body;
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureStocksAccount(req.authUser, selectedMode);
    const executionQuote = await fetchStockExecutionQuote(symbol);

    const executionPrice = executionQuote.priceEUR;
    const orderTotal = quantity * executionPrice;
    const roundedOrderTotal = toNumber(orderTotal);

    let holding = await PortfolioHolding.findOne({
      userId: req.authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode: selectedMode,
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
          accountType: STOCKS_ACCOUNT_TYPE,
          mode: selectedMode,
          assetType: 'stock',
          symbol,
          name: null,
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
      } else {
        holding.quantity = nextQuantity;
        await holding.save();
      }

      account.cashBalance = toNumber(account.cashBalance + roundedOrderTotal);
    }

    await account.save();

    const trade = await PortfolioTrade.create({
      userId: req.authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'stock',
      coinId: null,
      symbol,
      side,
      quantity,
      price: executionPrice,
      total: roundedOrderTotal,
      executedPriceOriginal: executionQuote.priceUSD,
      originalCurrency: 'USD',
      fxRateToEur: executionQuote.usdToEurRate,
      executedAt: new Date(),
    });

    const refreshedHoldings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'stock',
    });
    const summary = await buildStocksSummary({
      account,
      holdings: refreshedHoldings,
    });

    await upsertDailySnapshot({
      userId: req.authUser._id,
      mode: selectedMode,
      totals: summary.totals,
    });

    sendSuccess(res, {
      selectedMode,
      trade: serializeTrade(trade),
      account: serializeAccount(account),
      holdingsSummary: summary.totals,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
};

marketStocksRouter.get(
  '/search',
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
  '/candles/_debug',
  requireAuth,
  validateRequest({ query: marketStocksCandlesQuerySchema }),
  async (req, res, next) => {
    try {
      if (env.NODE_ENV !== 'development') {
        throw new AppError({
          message: 'Not found.',
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      const { symbol, range } = req.query;
      const selectedMode = resolveSelectedModeOrNull(req.authUser) ?? STOCKS_DEFAULT_MODE;
      const candlesResult = await getStockCandlesByRange(symbol, range);

      sendSuccess(res, {
        providerUsed: candlesResult.provider,
        stooqSymbolUsed: candlesResult.stooqSymbol ?? null,
        requestUrlWithoutSensitive: candlesResult.requestUrlWithoutToken ?? null,
        rawResponseFirst200Chars: candlesResult.rawResponseFirst200Chars ?? '',
        points: candlesResult.series.length,
        sampleFirst3: candlesResult.series.slice(0, 3),
        meta: {
          status: candlesResult.status,
          provider: candlesResult.provider,
          reason: candlesResult.reason ?? null,
        },
        range,
        symbol,
        mode: selectedMode,
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
      const { symbol, range } = req.query;
      const candlesResult = await getStockCandlesByRange(symbol, range);
      const pointsCount = Array.isArray(candlesResult.series) ? candlesResult.series.length : 0;

      sendSuccess(
        res,
        {
          series: candlesResult.series,
          range,
          symbol,
          meta: {
            provider: candlesResult.provider,
            status: candlesResult.status,
            points: pointsCount,
            reason: candlesResult.reason ?? null,
          },
        },
        200,
        {
          returned: pointsCount,
          provider: candlesResult.provider,
          status: candlesResult.status,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.get('/state', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveSelectedModeOrNull(req.authUser);
    await ensureStocksAccounts(req.authUser);

    const [fundedState, demoState] = await Promise.all([
      buildModeState(req.authUser, STOCKS_FUNDED_MODE),
      buildModeState(req.authUser, STOCKS_DEMO_MODE),
    ]);

    sendSuccess(res, {
      selectedMode,
      accounts: {
        funded: fundedState,
        demo: demoState,
      },
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

marketStocksRouter.post(
  '/mode',
  requireAuth,
  validateRequest({ body: marketStocksModeMutationSchema }),
  async (req, res, next) => {
    try {
      const { mode } = req.body;
      req.authUser.marketStocksMode = mode;
      await req.authUser.save();
      await ensureStocksAccount(req.authUser, mode);

      sendSuccess(res, {
        selectedMode: mode,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.post(
  '/demo/set-budget',
  requireAuth,
  validateRequest({ body: marketStocksDemoBudgetSchema }),
  async (req, res, next) => {
    try {
      const selectedMode = resolveActiveMode(req.authUser);

      if (selectedMode !== STOCKS_DEMO_MODE) {
        throw new AppError({
          message: 'Demo budget can only be set while Demo mode is selected.',
          statusCode: 400,
          code: 'MODE_NOT_DEMO',
        });
      }

      const amountEUR = toMoney(req.body.amountEUR);
      const demoAccount = await ensureStocksAccount(req.authUser, STOCKS_DEMO_MODE);

      await Promise.all([
        PortfolioHolding.deleteMany({
          userId: req.authUser._id,
          accountType: STOCKS_ACCOUNT_TYPE,
          mode: STOCKS_DEMO_MODE,
          assetType: 'stock',
        }),
        PortfolioTrade.deleteMany({
          userId: req.authUser._id,
          accountType: STOCKS_ACCOUNT_TYPE,
          mode: STOCKS_DEMO_MODE,
          assetType: 'stock',
        }),
        PortfolioSnapshot.deleteMany({
          userId: req.authUser._id,
          accountType: STOCKS_ACCOUNT_TYPE,
          mode: STOCKS_DEMO_MODE,
        }),
      ]);

      demoAccount.cashBalance = amountEUR;
      await demoAccount.save();

      const totals = {
        cashBalance: amountEUR,
        cashBalanceEUR: amountEUR,
        holdingsValue: 0,
        holdingsValueEUR: 0,
        totalValue: amountEUR,
        portfolioValueEUR: amountEUR,
        dayPnL: 0,
        dayPnLPct: 0,
        unrealizedPnL: 0,
        holdingsCount: 0,
      };

      await upsertDailySnapshot({
        userId: req.authUser._id,
        mode: STOCKS_DEMO_MODE,
        totals,
      });

      sendSuccess(res, {
        selectedMode: resolveSelectedModeOrNull(req.authUser),
        demoAccount: serializeAccount(demoAccount),
        totals,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.get('/account', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureStocksAccount(req.authUser, selectedMode);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'stock',
    });
    const summary = await buildStocksSummary({ account, holdings });

    logModeScopedAccount({
      selectedMode,
      account,
      holdingsCount: summary.holdings.length,
    });

    sendSuccess(res, {
      selectedMode,
      account: serializeAccount(account),
      totals: summary.totals,
      holdingsCount: summary.holdings.length,
      cashBalanceEUR: summary.totals.cashBalanceEUR,
      portfolioValueEUR: summary.totals.portfolioValueEUR,
      dayPnL: summary.totals.dayPnL,
      dayPnLPct: summary.totals.dayPnLPct,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

marketStocksRouter.get('/holdings', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureStocksAccount(req.authUser, selectedMode);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'stock',
    });

    const summary = await buildStocksSummary({
      account,
      holdings,
    });

    logModeScopedAccount({
      selectedMode,
      account,
      holdingsCount: summary.holdings.length,
    });

    await upsertDailySnapshot({
      userId: req.authUser._id,
      mode: selectedMode,
      totals: summary.totals,
    });

    sendSuccess(res, {
      selectedMode,
      account: serializeAccount(account),
      holdings: summary.holdings,
      totals: summary.totals,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

marketStocksRouter.get('/allocation', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureStocksAccount(req.authUser, selectedMode);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: STOCKS_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'stock',
    });

    const summary = await buildStocksSummary({ account, holdings });
    const allocation = computeAllocation({ holdingsSummary: summary });

    sendSuccess(res, {
      selectedMode,
      allocation,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

marketStocksRouter.get(
  '/trades',
  requireAuth,
  validateRequest({ query: marketStocksTradesQuerySchema }),
  async (req, res, next) => {
    try {
      const selectedMode = resolveActiveMode(req.authUser);
      const trades = await PortfolioTrade.find({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
        mode: selectedMode,
        assetType: 'stock',
      })
        .sort({ executedAt: -1, createdAt: -1 })
        .limit(req.query.limit);

      sendSuccess(
        res,
        {
          selectedMode,
          trades: trades.map(serializeTrade),
        },
        200,
        {
          returned: trades.length,
          limit: req.query.limit,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.get(
  '/performance',
  requireAuth,
  validateRequest({ query: marketStocksPerformanceQuerySchema }),
  async (req, res, next) => {
    try {
      const selectedMode = resolveActiveMode(req.authUser);
      const account = await ensureStocksAccount(req.authUser, selectedMode);
      const holdings = await PortfolioHolding.find({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
        mode: selectedMode,
        assetType: 'stock',
      });
      const performance = await computePerformanceSeries({
        account,
        holdings,
        range: req.query.range,
      });

      sendSuccess(
        res,
        {
          selectedMode,
          range: performance.range,
          series: performance.series,
          meta: performance.meta,
        },
        200,
        {
          points: performance.meta.points,
          symbols: performance.meta.symbols.length,
          range: performance.range,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.post(
  '/topup-from-wallet',
  requireAuth,
  validateRequest({ body: marketTopUpFromWalletSchema }),
  async (req, res, next) => {
    try {
      const selectedMode = resolveActiveMode(req.authUser);

      if (selectedMode !== STOCKS_FUNDED_MODE) {
        throw new AppError({
          message: 'Top up from Budget is only available in Start Investing mode.',
          statusCode: 400,
          code: 'MODE_NOT_FUNDED',
        });
      }

      const amountRON = toNumber(req.body.amountRON, 2);
      const wallet = await ensureWallet(req.authUser._id);

      if (amountRON > wallet.balance) {
        throw new AppError({
          message: 'Not enough RON balance in investing wallet.',
          statusCode: 400,
          code: 'INSUFFICIENT_FUNDS',
        });
      }

      const conversion = await convert({
        from: WALLET_CURRENCY,
        to: STOCKS_BASE_CURRENCY,
        amount: amountRON,
      });
      const toppedUpEUR = toNumber(conversion.convertedAmount, 2);
      const eurPerRonRate = toNumber(conversion.rateToPerFrom, 10);
      const ronPerEurRate =
        typeof conversion.rateFromPerTo === 'number' && conversion.rateFromPerTo > 0
          ? toNumber(conversion.rateFromPerTo, 10)
          : null;

      wallet.balance = toNumber(wallet.balance - amountRON, 2);
      await wallet.save();

      const stocksAccount = await ensureStocksAccount(req.authUser, STOCKS_FUNDED_MODE);
      stocksAccount.cashBalance = toNumber(stocksAccount.cashBalance + toppedUpEUR, 2);
      await stocksAccount.save();

      await InvestingWalletLedger.create({
        userId: req.authUser._id,
        type: 'fx_convert_to_eur',
        amountRON: -amountRON,
        meta: {
          from: WALLET_CURRENCY,
          to: STOCKS_BASE_CURRENCY,
          fromAmountRON: amountRON,
          toAmountEUR: toppedUpEUR,
          rateRONperEUR: ronPerEurRate,
          rateEURperRON: eurPerRonRate,
          rateEurPerRon: eurPerRonRate,
          rateRonPerEur: ronPerEurRate,
          eurAmount: toppedUpEUR,
          targetAccountType: STOCKS_ACCOUNT_TYPE,
          targetMode: STOCKS_FUNDED_MODE,
          portfolioAccountId: stocksAccount._id.toString(),
        },
      });

      const refreshedHoldings = await PortfolioHolding.find({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
        mode: STOCKS_FUNDED_MODE,
        assetType: 'stock',
      });
      const summary = await buildStocksSummary({
        account: stocksAccount,
        holdings: refreshedHoldings,
      });

      await upsertDailySnapshot({
        userId: req.authUser._id,
        mode: STOCKS_FUNDED_MODE,
        totals: summary.totals,
      });

      sendSuccess(res, {
        selectedMode,
        amountRON,
        toppedUpEUR,
        walletBalanceRON: toNumber(wallet.balance, 2),
        stocksCashBalanceEUR: toNumber(stocksAccount.cashBalance, 2),
        rate: {
          eurPerRon: eurPerRonRate,
          ronPerEur: ronPerEurRate,
        },
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.post('/reset', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureStocksAccount(req.authUser, selectedMode);

    await Promise.all([
      PortfolioHolding.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
        mode: selectedMode,
        assetType: 'stock',
      }),
      PortfolioTrade.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
        mode: selectedMode,
        assetType: 'stock',
      }),
      PortfolioSnapshot.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
        mode: selectedMode,
      }),
    ]);

    account.cashBalance = getStartingCashBalanceForMode(selectedMode);
    await account.save();

    const totals = {
      cashBalance: toMoney(account.cashBalance),
      cashBalanceEUR: toMoney(account.cashBalance),
      holdingsValue: 0,
      holdingsValueEUR: 0,
      totalValue: toMoney(account.cashBalance),
      portfolioValueEUR: toMoney(account.cashBalance),
      dayPnL: 0,
      dayPnLPct: 0,
      unrealizedPnL: 0,
      holdingsCount: 0,
    };

    await upsertDailySnapshot({
      userId: req.authUser._id,
      mode: selectedMode,
      totals,
    });

    sendSuccess(res, {
      selectedMode,
      account: serializeAccount(account),
      totals,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

marketStocksRouter.post('/admin/reset', requireAuth, async (req, res, next) => {
  try {
    if (env.NODE_ENV !== 'development') {
      throw new AppError({
        message: 'Not found.',
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    await Promise.all([
      PortfolioHolding.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
      }),
      PortfolioTrade.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
      }),
      PortfolioSnapshot.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
      }),
      PortfolioAccount.deleteMany({
        userId: req.authUser._id,
        accountType: STOCKS_ACCOUNT_TYPE,
      }),
    ]);

    await ensureStocksAccounts(req.authUser);
    req.authUser.marketStocksMode = null;
    await req.authUser.save();

    const fundedAccount = await ensureStocksAccount(req.authUser, STOCKS_FUNDED_MODE);
    const demoAccount = await ensureStocksAccount(req.authUser, STOCKS_DEMO_MODE);

    sendSuccess(res, {
      reset: true,
      selectedMode: null,
      accounts: {
        funded: serializeAccount(fundedAccount),
        demo: serializeAccount(demoAccount),
      },
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

marketStocksRouter.get(
  '/order/quote',
  requireAuth,
  validateRequest({ query: marketStocksProfileQuerySchema }),
  async (req, res, next) => {
    try {
      const quote = await fetchStockExecutionQuote(req.query.symbol);

      sendSuccess(res, quote);
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

marketStocksRouter.post(
  '/order',
  requireAuth,
  validateRequest({ body: marketStocksOrderSchema }),
  handleStockOrder,
);

export { marketStocksRouter };
