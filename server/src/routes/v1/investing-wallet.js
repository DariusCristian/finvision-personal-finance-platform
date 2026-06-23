import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import { FxProviderError, convert } from '../../integrations/fx/frankfurterClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { Category } from '../../models/category.js';
import { InvestingWalletLedger } from '../../models/investing-wallet-ledger.js';
import { InvestingWallet } from '../../models/investing-wallet.js';
import { Transaction } from '../../models/transaction.js';
import { sendSuccess } from '../../utils/response.js';
import {
  investingWalletConvertQuoteQuerySchema,
  investingWalletConvertSchema,
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

// Funding the investing wallet moves money out of the user's spendable budget,
// so it is recorded as an "Investing" expense transaction. Without this, the
// budget's total balance (income - expenses) never reflects the outflow and the
// user could "add" unlimited funds with no effect on their balance.
const recordInvestingDepositExpense = async (userId, amountRON, note) => {
  const investingCategory = await Category.findOne({
    userId: null,
    slug: 'investing',
  }).select('_id');

  if (!investingCategory) {
    return;
  }

  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  await Transaction.create({
    userId,
    type: 'expense',
    categoryId: investingCategory._id,
    amount: amountRON,
    currency: WALLET_CURRENCY,
    date: new Date(),
    description: trimmedNote ? `Investing wallet deposit — ${trimmedNote}` : 'Investing wallet deposit',
    recurrence: 'none',
  });
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

  const amountToAdd = toMoney(wallet.autoFundAmount);

  if (amountToAdd <= 0) {
    return wallet;
  }

  wallet.balance = toMoney(wallet.balance + amountToAdd);
  wallet.lastAutoFundAt = now;
  await wallet.save();

  await InvestingWalletLedger.create({
    userId: wallet.userId,
    type: 'autofund',
    amountRON: amountToAdd,
    meta: {
      note: 'Monthly auto-fund',
      autoFundDayOfMonth: wallet.autoFundDayOfMonth,
      autoFundAmount: amountToAdd,
    },
  });

  return wallet;
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
    const wallet = await ensureWallet(req.authUser._id);
    await applyAutoFundIfDue(wallet);
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
      const wallet = await ensureWallet(req.authUser._id);
      await applyAutoFundIfDue(wallet);
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
      const wallet = await ensureWallet(req.authUser._id);
      await applyAutoFundIfDue(wallet);
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
      const wallet = await ensureWallet(req.authUser._id);
      await applyAutoFundIfDue(wallet);
      const amountRON = toMoney(req.body.amountRON);

      wallet.balance = toMoney(wallet.balance + amountRON);
      await wallet.save();

      await InvestingWalletLedger.create({
        userId: req.authUser._id,
        type: 'deposit',
        amountRON,
        meta: {
          note: req.body.note ?? '',
        },
      });

      await recordInvestingDepositExpense(req.authUser._id, amountRON, req.body.note);

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

investingWalletRouter.post(
  '/convert',
  requireAuth,
  validateRequest({ body: investingWalletConvertSchema }),
  async (req, res, next) => {
    try {
      throw new AppError({
        message: 'Use /api/v1/invest/crypto/topup-from-wallet for Start Investing top-ups.',
        statusCode: 410,
        code: 'WALLET_CONVERT_DEPRECATED',
      });
    } catch (error) {
      next(normalizeProviderError(error));
    }
  },
);

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
