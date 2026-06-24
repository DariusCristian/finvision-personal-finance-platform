import { Router } from 'express';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import {
  CoinGeckoProviderError,
  getMarketChart,
  getSimplePrices,
  isCoinGeckoConfigured,
} from '../../integrations/coingecko/coingeckoClient.js';
import { FxProviderError, convert } from '../../integrations/fx/frankfurterClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { InvestFunding } from '../../models/invest-funding.js';
import { InvestingWalletLedger } from '../../models/investing-wallet-ledger.js';
import { InvestingWallet } from '../../models/investing-wallet.js';
import { PortfolioAccount } from '../../models/portfolio-account.js';
import { PortfolioHolding } from '../../models/portfolio-holding.js';
import { PortfolioSnapshot } from '../../models/portfolio-snapshot.js';
import { PortfolioTrade } from '../../models/portfolio-trade.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess } from '../../utils/response.js';
import {
  investCryptoDemoBudgetSchema,
  investCryptoModeMutationSchema,
  investCryptoTopUpFromWalletSchema,
  investFundingQuerySchema,
  investOrderSchema,
  investPerformanceQuerySchema,
  investSnapshotsQuerySchema,
  investTopUpQuoteQuerySchema,
  investTradesQuerySchema,
} from '../../validation/invest.js';

const investRouter = Router();

const CRYPTO_ACCOUNT_TYPE = 'crypto';
const CRYPTO_FUNDED_MODE = 'funded';
const CRYPTO_DEMO_MODE = 'demo';
const CRYPTO_DEFAULT_MODE = CRYPTO_FUNDED_MODE;
const WALLET_CURRENCY = 'RON';
const INVEST_BASE_CURRENCY = 'EUR';
const INVEST_PRICING_VS = 'eur';
const INVEST_PRICING_CURRENCY = 'EUR';
const FUNDED_STARTING_CRYPTO_CASH_BALANCE = 0;
const DEMO_STARTING_CRYPTO_CASH_BALANCE = 5000;
const MIN_HOLDING_QUANTITY = 0.00000001;
const PERFORMANCE_DAYS_BY_RANGE = {
  '7d': 7,
  '30d': 30,
};
const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value, fractionDigits = 8) => Number(Number(value).toFixed(fractionDigits));
const toMoney = (value) => toNumber(value, 2);
const toRate = (value) => toNumber(value, 10);
const toIsoDay = (date = new Date()) => date.toISOString().slice(0, 10);

const isCryptoMode = (mode) => mode === CRYPTO_FUNDED_MODE || mode === CRYPTO_DEMO_MODE;

const resolveSelectedModeOrNull = (authUser) =>
  isCryptoMode(authUser?.investCryptoMode) ? authUser.investCryptoMode : null;

const resolveActiveMode = (authUser) => resolveSelectedModeOrNull(authUser) ?? CRYPTO_DEFAULT_MODE;

const getStartingCashBalanceForMode = (mode) =>
  mode === CRYPTO_DEMO_MODE ? DEMO_STARTING_CRYPTO_CASH_BALANCE : FUNDED_STARTING_CRYPTO_CASH_BALANCE;

const logModeScopedAccount = ({ selectedMode, account, holdingsCount }) => {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  logger.info('invest.mode_scoped_account', {
    selectedMode,
    accountType: account?.accountType ?? null,
    accountId: account?._id?.toString?.() ?? null,
    cashBalanceEUR: toMoney(account?.cashBalance ?? 0),
    holdingsCount,
  });
};

const toUtcDayTimestamp = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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

const buildDailyPriceResolver = ({ chartPoints, fallbackPrice }) => {
  const dailyPrices = new Map();

  [...chartPoints]
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price))
    .sort((left, right) => left.t - right.t)
    .forEach((point) => {
      dailyPrices.set(toUtcDayTimestamp(point.t), point.price);
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

const buildFlatPerformanceSeries = ({ cashBalance, days }) =>
  buildRangeDayTimestamps(days).map((dayTimestamp) => ({
    t: dayTimestamp,
    value: toMoney(cashBalance),
  }));

const serializeAccount = (account) => ({
  id: account._id.toString(),
  accountType: account.accountType,
  mode: account.mode,
  cashBalance: toMoney(account.cashBalance),
  cashBalanceEUR: toMoney(account.cashBalance),
  baseCurrency: INVEST_BASE_CURRENCY,
  pricingCurrency: INVEST_PRICING_CURRENCY,
  pricingVs: INVEST_PRICING_VS,
  pricingNote: null,
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
  fxRateToEur: typeof trade.fxRateToEur === 'number' ? toRate(trade.fxRateToEur) : null,
  executedAt: trade.executedAt?.toISOString?.() ?? trade.createdAt?.toISOString?.() ?? null,
  createdAt: trade.createdAt?.toISOString?.() ?? null,
});

const serializeSnapshot = (snapshot) => ({
  id: snapshot._id.toString(),
  accountType: snapshot.accountType,
  mode: snapshot.mode,
  date: snapshot.date,
  totalValue: toMoney(snapshot.totalValue),
  totalValueEUR: toMoney(snapshot.totalValue),
  cashBalance: toMoney(snapshot.cashBalance),
  cashBalanceEUR: toMoney(snapshot.cashBalance),
  holdingsValue: toMoney(snapshot.holdingsValue),
  holdingsValueEUR: toMoney(snapshot.holdingsValue),
  createdAt: snapshot.createdAt?.toISOString?.() ?? null,
});

const serializeFunding = (funding) => ({
  id: funding._id.toString(),
  mode: funding.mode,
  fromCurrency: funding.fromCurrency,
  fromAmount: toMoney(funding.fromAmount),
  toCurrency: funding.toCurrency,
  toAmount: toMoney(funding.toAmount),
  rate: toRate(funding.rate),
  provider: funding.provider,
  createdAt: funding.createdAt?.toISOString?.() ?? null,
});

const ensureInvestingWallet = async (userId) => {
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

const ensureCryptoPortfolioAccount = async (authUser, mode = CRYPTO_DEFAULT_MODE) => {
  let account = await PortfolioAccount.findOne({
    userId: authUser._id,
    accountType: CRYPTO_ACCOUNT_TYPE,
    mode,
  });

  if (!account) {
    account = await PortfolioAccount.create({
      userId: authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode,
      baseCurrency: INVEST_BASE_CURRENCY,
      cashBalance: getStartingCashBalanceForMode(mode),
    });
    return account;
  }

  if (account.baseCurrency !== INVEST_BASE_CURRENCY) {
    account.baseCurrency = INVEST_BASE_CURRENCY;
    await account.save();
  }

  return account;
};

const ensureCryptoAccounts = async (authUser) => {
  const [funded, demo] = await Promise.all([
    ensureCryptoPortfolioAccount(authUser, CRYPTO_FUNDED_MODE),
    ensureCryptoPortfolioAccount(authUser, CRYPTO_DEMO_MODE),
  ]);

  return { funded, demo };
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

const buildPortfolioSummary = async ({ account, holdings }) => {
  const cryptoCoinIds = holdings.map((holding) => holding.coinId).filter(Boolean);
  const cryptoPricesMap = await fetchCryptoPricesMap(cryptoCoinIds);

  const enriched = holdings
    .map((holding) => {
      const quote = holding.coinId ? cryptoPricesMap[holding.coinId] ?? null : null;
      const currentPrice = quote?.price ?? 0;
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
        quantity: toNumber(holding.quantity),
        avgCost: toMoney(holding.avgCost),
        avgCostEUR: toMoney(holding.avgCost),
        currentPrice: toMoney(currentPrice),
        currentPriceEUR: toMoney(currentPrice),
        change24h: typeof change24h === 'number' ? toNumber(change24h, 4) : null,
        marketValue: toMoney(marketValue),
        marketValueEUR: toMoney(marketValue),
        unrealizedPnL: toMoney(unrealizedPnL),
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

  const cashBalance = toMoney(account.cashBalance);
  const totalValue = toMoney(cashBalance + holdingsValue);

  return {
    holdings: withAllocation,
    totals: {
      cashBalance,
      cashBalanceEUR: cashBalance,
      holdingsValue: toMoney(holdingsValue),
      holdingsValueEUR: toMoney(holdingsValue),
      totalValue,
      totalValueEUR: totalValue,
      unrealizedPnL: toMoney(withAllocation.reduce((sum, item) => sum + item.unrealizedPnL, 0)),
      holdingsCount: withAllocation.length,
    },
  };
};

const computeAllocation = ({ holdingsSummary }) => {
  const cryptoValue = holdingsSummary.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const cashValue = holdingsSummary.totals.cashBalance;
  const total = toMoney(cryptoValue + cashValue);

  const breakdown = [
    {
      label: 'Crypto',
      value: toMoney(cryptoValue),
      pct: total > 0 ? toNumber((cryptoValue / total) * 100, 4) : 0,
    },
    {
      label: 'Cash',
      value: toMoney(cashValue),
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
      coinId: holding.coinId,
      value: holding.marketValue,
      pctOfAssets:
        cryptoValue > 0 ? toNumber((holding.marketValue / cryptoValue) * 100, 4) : 0,
      pctOfTotal: total > 0 ? toNumber((holding.marketValue / total) * 100, 4) : 0,
    }));

  return {
    accountType: CRYPTO_ACCOUNT_TYPE,
    total,
    breakdown,
    topHoldings,
  };
};

const upsertDailySnapshot = async ({ userId, mode, totals }) => {
  const date = toIsoDay();

  await PortfolioSnapshot.findOneAndUpdate(
    {
      userId,
      accountType: CRYPTO_ACCOUNT_TYPE,
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

const computePerformanceSeries = async ({ account, holdings, range }) => {
  const days = PERFORMANCE_DAYS_BY_RANGE[range] ?? PERFORMANCE_DAYS_BY_RANGE['7d'];
  const dayTimestamps = buildRangeDayTimestamps(days);
  const cashBalance = typeof account.cashBalance === 'number' ? account.cashBalance : 0;
  const cryptoHoldings = holdings.filter((holding) => holding.assetType === 'crypto' && holding.coinId);

  if (cryptoHoldings.length === 0) {
    return {
      range,
      series: buildFlatPerformanceSeries({ cashBalance, days }),
      meta: {
        points: days,
        coins: [],
      },
    };
  }

  const chartByCoinId = {};

  await Promise.all(
    cryptoHoldings.map(async (holding) => {
      const fallbackChart = [];
      const coinId = String(holding.coinId).trim().toLowerCase();

      if (!isCoinGeckoConfigured()) {
        chartByCoinId[coinId] = fallbackChart;
        return;
      }

      try {
        const chartPoints = await getMarketChart(coinId, INVEST_PRICING_VS, days);
        chartByCoinId[coinId] = chartPoints;
      } catch {
        chartByCoinId[coinId] = fallbackChart;
      }
    }),
  );

  const priceResolvers = cryptoHoldings.map((holding) => {
    const coinId = String(holding.coinId).trim().toLowerCase();
    const fallbackPrice =
      typeof holding.avgCost === 'number' && Number.isFinite(holding.avgCost) ? holding.avgCost : 0;
    const chartPoints = Array.isArray(chartByCoinId[coinId]) ? chartByCoinId[coinId] : [];

    return {
      coinId,
      quantity: holding.quantity,
      resolvePrice: buildDailyPriceResolver({
        chartPoints,
        fallbackPrice,
      }),
    };
  });

  const series = dayTimestamps.map((dayTimestamp) => {
    const holdingsValue = priceResolvers.reduce((sum, resolver) => (
      sum + (resolver.quantity * resolver.resolvePrice(dayTimestamp))
    ), 0);

    return {
      t: dayTimestamp,
      value: toMoney(cashBalance + holdingsValue),
    };
  });

  return {
    range,
    series,
    meta: {
      points: series.length,
      coins: [...new Set(priceResolvers.map((item) => item.coinId))],
    },
  };
};

const buildModeState = async (authUser, mode) => {
  const account = await ensureCryptoPortfolioAccount(authUser, mode);
  const holdings = await PortfolioHolding.find({
    userId: authUser._id,
    accountType: CRYPTO_ACCOUNT_TYPE,
    mode,
    assetType: 'crypto',
  });
  const tradesCount = await PortfolioTrade.countDocuments({
    userId: authUser._id,
    accountType: CRYPTO_ACCOUNT_TYPE,
    mode,
    assetType: 'crypto',
  });

  const summary = await buildPortfolioSummary({
    account,
    holdings,
  });

  return {
    cashBalanceEUR: summary.totals.cashBalanceEUR,
    totalValueEUR: summary.totals.totalValueEUR,
    holdingsCount: summary.totals.holdingsCount,
    tradesCount,
  };
};

const topUpFundedFromWallet = async ({ authUser, amountRON }) => {
  const selectedMode = resolveActiveMode(authUser);

  if (selectedMode !== CRYPTO_FUNDED_MODE) {
    throw new AppError({
      message: 'Top up from Budget is only available in Start Investing mode.',
      statusCode: 400,
      code: 'MODE_NOT_FUNDED',
    });
  }

  const normalizedAmountRON = toMoney(amountRON);
  const wallet = await ensureInvestingWallet(authUser._id);

  if (normalizedAmountRON > wallet.balance) {
    throw new AppError({
      message: 'Not enough RON balance in investing wallet.',
      statusCode: 400,
      code: 'INSUFFICIENT_FUNDS',
    });
  }

  const conversion = await convert({
    from: WALLET_CURRENCY,
    to: INVEST_BASE_CURRENCY,
    amount: normalizedAmountRON,
  });

  const addedEUR = toMoney(conversion.convertedAmount);
  const eurPerRonRate = toRate(conversion.rateToPerFrom);
  const ronPerEurRate =
    typeof conversion.rateFromPerTo === 'number' && conversion.rateFromPerTo > 0
      ? toRate(conversion.rateFromPerTo)
      : null;

  wallet.balance = toMoney(wallet.balance - normalizedAmountRON);
  await wallet.save();

  const account = await ensureCryptoPortfolioAccount(authUser, CRYPTO_FUNDED_MODE);
  account.cashBalance = toMoney(account.cashBalance + addedEUR);
  await account.save();

  await InvestingWalletLedger.create({
    userId: authUser._id,
    type: 'fx_convert_to_eur',
    amountRON: -normalizedAmountRON,
    meta: {
      from: WALLET_CURRENCY,
      to: INVEST_BASE_CURRENCY,
      fromAmountRON: normalizedAmountRON,
      toAmountEUR: addedEUR,
      rateRONperEUR: ronPerEurRate,
      rateEURperRON: eurPerRonRate,
      targetAccountType: CRYPTO_ACCOUNT_TYPE,
      targetMode: CRYPTO_FUNDED_MODE,
    },
  });

  await InvestFunding.create({
    userId: authUser._id,
    mode: CRYPTO_FUNDED_MODE,
    fromCurrency: WALLET_CURRENCY,
    fromAmount: normalizedAmountRON,
    toCurrency: INVEST_BASE_CURRENCY,
    toAmount: addedEUR,
    rate: eurPerRonRate,
    provider: 'frankfurter',
  });

  const refreshedHoldings = await PortfolioHolding.find({
    userId: authUser._id,
    accountType: CRYPTO_ACCOUNT_TYPE,
    mode: CRYPTO_FUNDED_MODE,
    assetType: 'crypto',
  });

  const summary = await buildPortfolioSummary({
    account,
    holdings: refreshedHoldings,
  });

  await upsertDailySnapshot({
    userId: authUser._id,
    mode: CRYPTO_FUNDED_MODE,
    totals: summary.totals,
  });

  return {
    fromAmountRON: normalizedAmountRON,
    addedEUR,
    cashBalanceEUR: toMoney(account.cashBalance),
    walletBalanceRON: toMoney(wallet.balance),
    rate: {
      eurPerRon: eurPerRonRate,
      ronPerEur: ronPerEurRate,
    },
  };
};

investRouter.get('/crypto/state', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveSelectedModeOrNull(req.authUser);
    await ensureCryptoAccounts(req.authUser);

    const [fundedState, demoState] = await Promise.all([
      buildModeState(req.authUser, CRYPTO_FUNDED_MODE),
      buildModeState(req.authUser, CRYPTO_DEMO_MODE),
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

investRouter.post(
  '/crypto/mode',
  requireAuth,
  validateRequest({ body: investCryptoModeMutationSchema }),
  async (req, res, next) => {
    try {
      const { mode } = req.body;
      req.authUser.investCryptoMode = mode;
      await req.authUser.save();
      await ensureCryptoPortfolioAccount(req.authUser, mode);

      sendSuccess(res, {
        selectedMode: mode,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investRouter.post(
  '/crypto/demo/set-budget',
  requireAuth,
  validateRequest({ body: investCryptoDemoBudgetSchema }),
  async (req, res, next) => {
    try {
      const selectedMode = resolveActiveMode(req.authUser);

      if (selectedMode !== CRYPTO_DEMO_MODE) {
        throw new AppError({
          message: 'Demo budget can only be set while Demo mode is selected.',
          statusCode: 400,
          code: 'MODE_NOT_DEMO',
        });
      }

      const amountEUR = toMoney(req.body.amountEUR);
      const demoAccount = await ensureCryptoPortfolioAccount(req.authUser, CRYPTO_DEMO_MODE);

      await Promise.all([
        PortfolioHolding.deleteMany({
          userId: req.authUser._id,
          accountType: CRYPTO_ACCOUNT_TYPE,
          mode: CRYPTO_DEMO_MODE,
          assetType: 'crypto',
        }),
        PortfolioTrade.deleteMany({
          userId: req.authUser._id,
          accountType: CRYPTO_ACCOUNT_TYPE,
          mode: CRYPTO_DEMO_MODE,
          assetType: 'crypto',
        }),
        PortfolioSnapshot.deleteMany({
          userId: req.authUser._id,
          accountType: CRYPTO_ACCOUNT_TYPE,
          mode: CRYPTO_DEMO_MODE,
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
        totalValueEUR: amountEUR,
        unrealizedPnL: 0,
        holdingsCount: 0,
      };

      await upsertDailySnapshot({
        userId: req.authUser._id,
        mode: CRYPTO_DEMO_MODE,
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

const handleGetModeScopedAccount = async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureCryptoPortfolioAccount(req.authUser, selectedMode);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'crypto',
    });
    const summary = await buildPortfolioSummary({
      account,
      holdings,
    });

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
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
};

investRouter.get('/account', requireAuth, handleGetModeScopedAccount);
investRouter.get('/crypto/account', requireAuth, handleGetModeScopedAccount);

investRouter.get('/holdings', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureCryptoPortfolioAccount(req.authUser, selectedMode);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'crypto',
    });

    const summary = await buildPortfolioSummary({
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

investRouter.get('/allocation', requireAuth, async (req, res, next) => {
  try {
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureCryptoPortfolioAccount(req.authUser, selectedMode);
    const holdings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'crypto',
    });

    const summary = await buildPortfolioSummary({ account, holdings });
    const allocation = computeAllocation({ holdingsSummary: summary });

    sendSuccess(res, {
      selectedMode,
      allocation,
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
      const selectedMode = resolveActiveMode(req.authUser);
      const trades = await PortfolioTrade.find({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: selectedMode,
        assetType: 'crypto',
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
      const selectedMode = resolveActiveMode(req.authUser);
      const fundingEntries = await InvestFunding.find({
        userId: req.authUser._id,
        mode: selectedMode,
      })
        .sort({ createdAt: -1 })
        .limit(req.query.limit);

      sendSuccess(
        res,
        {
          selectedMode,
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
      const selectedMode = resolveActiveMode(req.authUser);

      if (selectedMode !== CRYPTO_FUNDED_MODE) {
        throw new AppError({
          message: 'Top up from Budget is only available in Start Investing mode.',
          statusCode: 400,
          code: 'MODE_NOT_FUNDED',
        });
      }

      const quote = await convert({
        from: req.query.fromCurrency,
        to: INVEST_BASE_CURRENCY,
        amount: req.query.amount,
      });

      sendSuccess(res, {
        selectedMode,
        fromCurrency: WALLET_CURRENCY,
        fromAmount: toMoney(req.query.amount),
        toCurrency: INVEST_BASE_CURRENCY,
        estimatedEUR: toMoney(quote.convertedAmount),
        rate: toRate(quote.rateToPerFrom),
        provider: quote.provider,
        date: quote.date,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investRouter.post(
  '/crypto/topup-from-wallet',
  requireAuth,
  validateRequest({ body: investCryptoTopUpFromWalletSchema }),
  async (req, res, next) => {
    try {
      const result = await topUpFundedFromWallet({
        authUser: req.authUser,
        amountRON: req.body.amountRON,
      });

      sendSuccess(res, {
        selectedMode: resolveActiveMode(req.authUser),
        ...result,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investRouter.post('/topup', requireAuth, (req, res, next) => {
  next(new AppError({
    message: 'Use /api/v1/invest/crypto/topup-from-wallet for Start Investing top-ups.',
    statusCode: 410,
    code: 'INVEST_TOPUP_ENDPOINT_DEPRECATED',
  }));
});

investRouter.get(
  '/performance',
  requireAuth,
  validateRequest({ query: investPerformanceQuerySchema }),
  async (req, res, next) => {
    try {
      const selectedMode = resolveActiveMode(req.authUser);
      const account = await ensureCryptoPortfolioAccount(req.authUser, selectedMode);
      const holdings = await PortfolioHolding.find({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: selectedMode,
        assetType: 'crypto',
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
          range: performance.range,
          points: performance.meta.points,
          coins: performance.meta.coins.length,
        },
      );
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
      const selectedMode = resolveActiveMode(req.authUser);
      const { days } = req.query;
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - days + 1);
      const fromDay = toIsoDay(startDate);

      const snapshots = await PortfolioSnapshot.find({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: selectedMode,
        date: {
          $gte: fromDay,
        },
      }).sort({ date: 1 });

      sendSuccess(
        res,
        {
          selectedMode,
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
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureCryptoPortfolioAccount(req.authUser, selectedMode);

    await Promise.all([
      PortfolioHolding.deleteMany({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: selectedMode,
      }),
      PortfolioTrade.deleteMany({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: selectedMode,
      }),
      PortfolioSnapshot.deleteMany({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: selectedMode,
      }),
      InvestFunding.deleteMany({
        userId: req.authUser._id,
        mode: selectedMode,
      }),
    ]);

    account.cashBalance = getStartingCashBalanceForMode(selectedMode);
    account.baseCurrency = INVEST_BASE_CURRENCY;
    await account.save();

    const totals = {
      cashBalance: toMoney(account.cashBalance),
      cashBalanceEUR: toMoney(account.cashBalance),
      holdingsValue: 0,
      holdingsValueEUR: 0,
      totalValue: toMoney(account.cashBalance),
      totalValueEUR: toMoney(account.cashBalance),
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
    next(error);
  }
});

investRouter.post('/admin/reset-crypto', requireAuth, async (req, res, next) => {
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
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      PortfolioTrade.deleteMany({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      PortfolioSnapshot.deleteMany({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      PortfolioAccount.deleteMany({
        userId: req.authUser._id,
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      InvestFunding.deleteMany({
        userId: req.authUser._id,
      }),
    ]);

    await ensureCryptoAccounts(req.authUser);
    req.authUser.investCryptoMode = null;
    await req.authUser.save();

    const fundedAccount = await ensureCryptoPortfolioAccount(req.authUser, CRYPTO_FUNDED_MODE);
    const demoAccount = await ensureCryptoPortfolioAccount(req.authUser, CRYPTO_DEMO_MODE);

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

const handleCryptoOrder = async (req, res, next) => {
  try {
    assertCoinGeckoAvailable();

    const { coinId, symbol, side, quantity } = req.body;
    const selectedMode = resolveActiveMode(req.authUser);
    const account = await ensureCryptoPortfolioAccount(req.authUser, selectedMode);
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
    const roundedOrderTotal = toMoney(orderTotal);

    let holding = await PortfolioHolding.findOne({
      userId: req.authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode: selectedMode,
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
          accountType: CRYPTO_ACCOUNT_TYPE,
          mode: selectedMode,
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

      account.cashBalance = toMoney(account.cashBalance - roundedOrderTotal);
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
      } else {
        holding.quantity = nextQuantity;
        await holding.save();
      }

      account.cashBalance = toMoney(account.cashBalance + roundedOrderTotal);
    }

    await account.save();

    const trade = await PortfolioTrade.create({
      userId: req.authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'crypto',
      coinId,
      symbol,
      side,
      quantity,
      price: executionPrice,
      total: roundedOrderTotal,
      executedAt: new Date(),
    });

    const refreshedHoldings = await PortfolioHolding.find({
      userId: req.authUser._id,
      accountType: CRYPTO_ACCOUNT_TYPE,
      mode: selectedMode,
      assetType: 'crypto',
    });

    const summary = await buildPortfolioSummary({
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

investRouter.post('/order', requireAuth, validateRequest({ body: investOrderSchema }), handleCryptoOrder);
investRouter.post('/crypto/order', requireAuth, validateRequest({ body: investOrderSchema }), handleCryptoOrder);

export { investRouter };
