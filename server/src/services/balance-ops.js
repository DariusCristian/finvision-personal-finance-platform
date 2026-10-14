import mongoose from 'mongoose';

import { InvestingWallet } from '../models/investing-wallet.js';
import { PortfolioAccount } from '../models/portfolio-account.js';
import { PortfolioHolding } from '../models/portfolio-holding.js';

// Atomic balance and quantity operations (AUDIT.md finding 1).
// Every check-and-write is a single conditional update, so concurrent requests cannot both pass the same check.
// Operations that can fail return null when their condition does not hold; callers map that to an AppError.

const MONEY_DECIMALS = 2;
const QUANTITY_DECIMALS = 8;
export const MIN_HOLDING_QUANTITY = 0.00000001;

// Runs `work(session)` in a MongoDB transaction (requires a replica set). The callback may be retried on transient
// errors, so it must not call external APIs or have side effects outside the session.
export const runInTransaction = (work) => mongoose.connection.transaction(work);

const roundTo = (value, decimals) => Number(Number(value).toFixed(decimals));

const assertPositiveAmount = (value, name) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number, received ${value}`);
  }
};

// Credits may round to zero (e.g. a 0.01 RON top-up is 0.002 EUR); crediting zero is harmless.
const assertNonNegativeAmount = (value, name) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative number, received ${value}`);
  }
};

const roundedField = (field, operator, amount, decimals) => ({
  $round: [{ [operator]: [{ $ifNull: [`$${field}`, 0] }, amount] }, decimals],
});

// Upserts only set fields on insert, so reading an existing document never rewrites it or bumps updatedAt.
const insertOnlyTimestamps = () => {
  const now = new Date();
  return { createdAt: now, updatedAt: now };
};

export const ensureInvestingWallet = (userId) =>
  InvestingWallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: insertOnlyTimestamps() },
    { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false },
  );

export const ensurePortfolioAccount = async ({
  userId,
  accountType,
  mode,
  baseCurrency,
  startingCashBalance,
}) => {
  const account = await PortfolioAccount.findOneAndUpdate(
    { userId, accountType, mode },
    { $setOnInsert: { baseCurrency, cashBalance: startingCashBalance, ...insertOnlyTimestamps() } },
    { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false },
  );

  if (account.baseCurrency !== baseCurrency) {
    account.baseCurrency = baseCurrency;
    await account.save();
  }

  return account;
};

// Sets account cash to an absolute value (demo budget, demo reset). Use inside the same transaction as the
// related deletes so a concurrent order cannot interleave.
export const setAccountCash = (
  { userId, accountType, mode },
  cashBalance,
  { session, baseCurrency } = {},
) =>
  PortfolioAccount.findOneAndUpdate(
    { userId, accountType, mode },
    {
      $set: {
        cashBalance: roundTo(cashBalance, MONEY_DECIMALS),
        ...(baseCurrency ? { baseCurrency } : {}),
      },
    },
    { new: true, session },
  );

export const debitWallet = (userId, amountRON, { session } = {}) => {
  const amount = roundTo(amountRON, MONEY_DECIMALS);
  assertPositiveAmount(amount, 'amountRON');

  return InvestingWallet.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    [{ $set: { balance: roundedField('balance', '$subtract', amount, MONEY_DECIMALS) } }],
    { new: true, session },
  );
};

export const creditWallet = (userId, amountRON, { session } = {}) => {
  const amount = roundTo(amountRON, MONEY_DECIMALS);
  assertNonNegativeAmount(amount, 'amountRON');

  return InvestingWallet.findOneAndUpdate(
    { userId },
    [{ $set: { balance: roundedField('balance', '$add', amount, MONEY_DECIMALS) } }],
    { new: true, session },
  );
};

export const debitAccountCash = ({ userId, accountType, mode }, amountEUR, { session } = {}) => {
  const amount = roundTo(amountEUR, MONEY_DECIMALS);
  assertPositiveAmount(amount, 'amountEUR');

  return PortfolioAccount.findOneAndUpdate(
    { userId, accountType, mode, cashBalance: { $gte: amount } },
    [{ $set: { cashBalance: roundedField('cashBalance', '$subtract', amount, MONEY_DECIMALS) } }],
    { new: true, session },
  );
};

export const creditAccountCash = ({ userId, accountType, mode }, amountEUR, { session } = {}) => {
  const amount = roundTo(amountEUR, MONEY_DECIMALS);
  assertNonNegativeAmount(amount, 'amountEUR');

  return PortfolioAccount.findOneAndUpdate(
    { userId, accountType, mode },
    [{ $set: { cashBalance: roundedField('cashBalance', '$add', amount, MONEY_DECIMALS) } }],
    { new: true, session },
  );
};

// `filter` must match the holding's unique index fields; `insertFields` are only used when the holding is created.
export const addToHolding = (filter, { quantity, price, insertFields = {} }, { session } = {}) => {
  const addedQuantity = roundTo(quantity, QUANTITY_DECIMALS);
  assertPositiveAmount(addedQuantity, 'quantity');

  const isNewHolding = { $eq: [{ $type: '$quantity' }, 'missing'] };
  const currentQuantity = { $ifNull: ['$quantity', 0] };
  const nextQuantity = { $add: [currentQuantity, addedQuantity] };
  const currentCost = { $multiply: [currentQuantity, { $ifNull: ['$avgCost', 0] }] };
  const insertOnlyFields = Object.fromEntries(
    Object.entries(insertFields).map(([field, value]) => [
      field,
      { $cond: [isNewHolding, { $literal: value }, `$${field}`] },
    ]),
  );

  return PortfolioHolding.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          ...insertOnlyFields,
          avgCost: {
            $round: [
              { $divide: [{ $add: [currentCost, addedQuantity * price] }, nextQuantity] },
              QUANTITY_DECIMALS,
            ],
          },
          quantity: { $round: [nextQuantity, QUANTITY_DECIMALS] },
          // Mongoose does not apply timestamps to pipeline upserts, so set them here.
          createdAt: { $cond: [isNewHolding, '$$NOW', '$createdAt'] },
          updatedAt: '$$NOW',
        },
      },
    ],
    { upsert: true, new: true, session, timestamps: false },
  );
};

// Returns the holding as it was after the decrement (null if the quantity was insufficient). A holding left with
// dust (≤ MIN_HOLDING_QUANTITY) is deleted.
export const removeFromHolding = async (filter, quantity, { session } = {}) => {
  const removedQuantity = roundTo(quantity, QUANTITY_DECIMALS);
  assertPositiveAmount(removedQuantity, 'quantity');

  const holding = await PortfolioHolding.findOneAndUpdate(
    { ...filter, quantity: { $gte: removedQuantity } },
    [
      {
        $set: {
          quantity: roundedField('quantity', '$subtract', removedQuantity, QUANTITY_DECIMALS),
        },
      },
    ],
    { new: true, session },
  );

  if (holding && holding.quantity <= MIN_HOLDING_QUANTITY) {
    await PortfolioHolding.deleteOne(
      { _id: holding._id, quantity: { $lte: MIN_HOLDING_QUANTITY } },
      { session },
    );
  }

  return holding;
};

// Applies the monthly auto-fund at most once per UTC month: the claim and the credit are one conditional update.
// Returns the updated wallet, or null when auto-fund is not due or was already applied this month.
export const claimAutoFund = (walletId, { now = new Date() } = {}, { session } = {}) => {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return InvestingWallet.findOneAndUpdate(
    {
      _id: walletId,
      autoFundEnabled: true,
      autoFundAmount: { $gt: 0 },
      autoFundDayOfMonth: now.getUTCDate(),
      $or: [{ lastAutoFundAt: null }, { lastAutoFundAt: { $lt: monthStart } }],
    },
    [
      {
        $set: {
          balance: {
            $round: [
              { $add: ['$balance', { $round: ['$autoFundAmount', MONEY_DECIMALS] }] },
              MONEY_DECIMALS,
            ],
          },
          lastAutoFundAt: now,
        },
      },
    ],
    { new: true, session },
  );
};
