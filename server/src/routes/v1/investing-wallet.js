import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import { FxProviderError, convert } from '../../integrations/fx/frankfurterClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { Category } from '../../models/category.js';
import { InvestingWalletLedger } from '../../models/investing-wallet-ledger.js';
import { Transaction } from '../../models/transaction.js';
import { buildCurrencyConversion, withConvertedAmount } from '../../services/currency-amounts.js';
import { logger } from '../../utils/logger.js';
import {
  claimAutoFund,
  creditWallet,
  ensureInvestingWallet as ensureWallet,
  runInTransaction,
} from '../../services/balance-ops.js';
import { sendSuccess } from '../../utils/response.js';
import {
  investingWalletConvertQuoteQuerySchema,
  investingWalletDepositSchema,
  investingWalletLedgerQuerySchema,
  investingWalletSummaryQuerySchema,
  investingWalletUpdateSchema,
} from '../../validation/investing-wallet.js';

const investingWalletRouter = Router();

const WALLET_CURRENCY = 'RON';
const PORTFOLIO_CURRENCY = 'EUR';

const toMoney = (value) => Number(Number(value).toFixed(2));
const toRate = (value) => Number(Number(value).toFixed(10));

const getMonthStartUtc = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));

const isSameUtcMonth = (leftDate, rightDate) =>
  leftDate &&
  rightDate &&
  leftDate.getUTCFullYear() === rightDate.getUTCFullYear() &&
  leftDate.getUTCMonth() === rightDate.getUTCMonth();

const serializeWallet = (wallet) => ({
  balance: toMoney(wallet.balance),
  monthlyGoal: toMoney(wallet.monthlyGoal),
  autoFundEnabled: Boolean(wallet.autoFundEnabled),
  autoFundAmount: toMoney(wallet.autoFundAmount),
  autoFundDayOfMonth: wallet.autoFundDayOfMonth,
});

// `conversion` comes from buildCurrencyConversion, fetched before the surrounding transaction started.
const recordInvestingDepositExpense = async (userId, amountRON, note, { session, conversion } = {}) => {
  const investingCategory = await Category.findOne({
    userId: null,
    slug: 'investing',
  })
    .select('_id')
    .session(session ?? null);

  if (!investingCategory) {
    return;
  }

  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  await Transaction.create(
    [
      {
        userId,
        type: 'expense',
        categoryId: investingCategory._id,
        amount: amountRON,
        currency: WALLET_CURRENCY,
        ...(conversion ? withConvertedAmount(conversion, amountRON) : {}),
        date: new Date(),
        description: trimmedNote ? `Investing wallet deposit — ${trimmedNote}` : 'Investing wallet deposit',
        recurrence: 'none',
      },
    ],
    { session },
  );
};

const computeInvestedThisMonth = async (userId) => {
  const startOfMonth = getMonthStartUtc();
  const entries = await InvestingWalletLedger.find({
    userId,
    createdAt: {
      $gte: startOfMonth,
    },
    type: {
      $in: ['deposit', 'autofund'],
    },
  }).select('amountRON');

  return toMoney(entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amountRON || 0)), 0));
};

const computeMonthSummary = async (userId, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const entries = await InvestingWalletLedger.find({
    userId,
    createdAt: {
      $gte: monthStart,
      $lt: monthEnd,
    },
  }).select('type amountRON');

  const investedThisMonthRON = toMoney(
    entries.reduce((sum, entry) => {
      const amountRON = Number(entry.amountRON || 0);

      if ((entry.type === 'deposit' || entry.type === 'autofund') && amountRON > 0) {
        return sum + amountRON;
      }

      return sum;
    }, 0),
  );

  const convertedToEurThisMonthRON = toMoney(
    entries.reduce((sum, entry) => {
      const amountRON = Number(entry.amountRON || 0);

      if (entry.type === 'fx_convert_to_eur') {
        return sum + Math.abs(amountRON);
      }

      return sum;
    }, 0),
  );

  return {
    investedThisMonthRON,
    convertedToEurThisMonthRON,
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
  };
};

const applyAutoFundIfDue = async (wallet) => {
  if (!wallet.autoFundEnabled || wallet.autoFundAmount <= 0) {
    return wallet;
  }

  const now = new Date();

  if (now.getUTCDate() !== wallet.autoFundDayOfMonth) {
    return wallet;
  }

  if (wallet.lastAutoFundAt && isSameUtcMonth(now, wallet.lastAutoFundAt)) {
    return wallet;
  }

  if (toMoney(wallet.autoFundAmount) <= 0) {
    return wallet;
  }

  // Rates for the expense record are fetched before the transaction. If they are unavailable, auto-fund is skipped
  // for this request (nothing is written) and the next wallet request retries, instead of failing a read.
  let conversion;
  try {
    conversion = await buildCurrencyConversion({
      amount: toMoney(wallet.autoFundAmount),
      currency: WALLET_CURRENCY,
      date: now,
    });
  } catch (error) {
    logger.warn('investing_wallet.autofund.fx_unavailable', { walletId: String(wallet._id), message: error.message });
    return wallet;
  }

  // The checks above only skip the transaction on most reads; claimAutoFund re-checks atomically so concurrent
  // requests apply the auto-fund at most once per month.
  const claimedWallet = await runInTransaction(async (session) => {
    const claimed = await claimAutoFund(wallet._id, { now }, { session });

    if (!claimed) {
      return null;
    }

    const amountToAdd = toMoney(claimed.autoFundAmount);

    await InvestingWalletLedger.create(
      [
        {
          userId: claimed.userId,
          type: 'autofund',
          amountRON: amountToAdd,
          meta: {
            note: 'Monthly auto-fund',
            autoFundDayOfMonth: claimed.autoFundDayOfMonth,
            autoFundAmount: amountToAdd,
          },
        },
      ],
      { session },
    );

    await recordInvestingDepositExpense(claimed.userId, amountToAdd, 'Monthly auto-fund', {
      session,
      conversion,
    });

    return claimed;
  });

  // Another request may have claimed it first; return the current wallet either way.
  return claimedWallet ?? ensureWallet(wallet.userId);
};

const normalizeProviderError = (error) => {
  if (error instanceof AppError) {
    return error;
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

investingWalletRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const wallet = await applyAutoFundIfDue(await ensureWallet(req.authUser._id));
    const investedThisMonthRON = await computeInvestedThisMonth(req.authUser._id);

    sendSuccess(res, {
      ...serializeWallet(wallet),
      investedThisMonthRON,
      currency: WALLET_CURRENCY,
    });
  } catch (error) {
    next(normalizeProviderError(error));
  }
});

investingWalletRouter.get(
  '/summary',
  requireAuth,
  validateRequest({ query: investingWalletSummaryQuerySchema }),
  async (req, res, next) => {
    try {
      await applyAutoFundIfDue(await ensureWallet(req.authUser._id));
      const summary = await computeMonthSummary(req.authUser._id, req.query.year, req.query.month);

      sendSuccess(res, summary);
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investingWalletRouter.patch(
  '/',
  requireAuth,
  validateRequest({ body: investingWalletUpdateSchema }),
  async (req, res, next) => {
    try {
      const wallet = await applyAutoFundIfDue(await ensureWallet(req.authUser._id));
      const { monthlyGoal, autoFundEnabled, autoFundAmount, autoFundDayOfMonth } = req.body;

      if (monthlyGoal !== undefined) {
        wallet.monthlyGoal = toMoney(monthlyGoal);
      }

      if (autoFundEnabled !== undefined) {
        wallet.autoFundEnabled = autoFundEnabled;
      }

      if (autoFundAmount !== undefined) {
        wallet.autoFundAmount = toMoney(autoFundAmount);
      }

      if (autoFundDayOfMonth !== undefined) {
        wallet.autoFundDayOfMonth = autoFundDayOfMonth;
      }

      await wallet.save();

      sendSuccess(res, {
        ...serializeWallet(wallet),
        investedThisMonthRON: await computeInvestedThisMonth(req.authUser._id),
        currency: WALLET_CURRENCY,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investingWalletRouter.post(
  '/deposit',
  requireAuth,
  validateRequest({ body: investingWalletDepositSchema }),
  async (req, res, next) => {
    try {
      await applyAutoFundIfDue(await ensureWallet(req.authUser._id));
      const amountRON = toMoney(req.body.amountRON);
      // Rates for the expense record, fetched before the transaction; unavailable rates fail the deposit (502).
      const conversion = await buildCurrencyConversion({
        amount: amountRON,
        currency: WALLET_CURRENCY,
        date: new Date(),
      });

      const wallet = await runInTransaction(async (session) => {
        const credited = await creditWallet(req.authUser._id, amountRON, { session });

        await InvestingWalletLedger.create(
          [
            {
              userId: req.authUser._id,
              type: 'deposit',
              amountRON,
              meta: {
                note: req.body.note ?? '',
              },
            },
          ],
          { session },
        );

        await recordInvestingDepositExpense(req.authUser._id, amountRON, req.body.note, {
          session,
          conversion,
        });

        return credited;
      });

      sendSuccess(res, {
        ...serializeWallet(wallet),
        investedThisMonthRON: await computeInvestedThisMonth(req.authUser._id),
        currency: WALLET_CURRENCY,
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investingWalletRouter.get(
  '/convert/quote',
  requireAuth,
  validateRequest({ query: investingWalletConvertQuoteQuerySchema }),
  async (req, res, next) => {
    try {
      const amountRON = toMoney(req.query.amountRON);
      const conversion = await convert({
        from: WALLET_CURRENCY,
        to: PORTFOLIO_CURRENCY,
        amount: amountRON,
      });

      const eurAmount = toMoney(conversion.convertedAmount);
      const eurPerRonRate = toRate(conversion.rateToPerFrom);
      const ronPerEurRate =
        typeof conversion.rateFromPerTo === 'number' && conversion.rateFromPerTo > 0
          ? toRate(conversion.rateFromPerTo)
          : null;

      sendSuccess(res, {
        amountRON,
        eurAmount,
        rate: {
          eurPerRon: eurPerRonRate,
          ronPerEur: ronPerEurRate,
        },
        asText: {
          ronToEur: `1 RON = ${eurPerRonRate} EUR`,
          eurToRon: ronPerEurRate ? `1 EUR = ${ronPerEurRate} RON` : null,
        },
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

investingWalletRouter.post('/convert', requireAuth, (req, res, next) => {
  next(new AppError({
    message: 'Use /api/v1/invest/crypto/topup-from-wallet for Start Investing top-ups.',
    statusCode: 410,
    code: 'WALLET_CONVERT_DEPRECATED',
  }));
});

investingWalletRouter.get(
  '/ledger',
  requireAuth,
  validateRequest({ query: investingWalletLedgerQuerySchema }),
  async (req, res, next) => {
    try {
      const entries = await InvestingWalletLedger.find({
        userId: req.authUser._id,
      })
        .sort({ createdAt: -1 })
        .limit(req.query.limit);

      sendSuccess(
        res,
        {
          entries: entries.map((entry) => ({
            id: entry._id.toString(),
            type: entry.type,
            amountRON: toMoney(entry.amountRON),
            meta: entry.meta ?? {},
            createdAt: entry.createdAt?.toISOString?.() ?? null,
          })),
        },
        200,
        {
          returned: entries.length,
          limit: req.query.limit,
        },
      );
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

export { investingWalletRouter };
