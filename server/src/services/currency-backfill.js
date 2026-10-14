import { Transaction } from '../models/transaction.js';
import { buildCurrencyConversion, SUPPORTED_CURRENCIES } from './currency-amounts.js';

// One-off backfill for transactions created before amounts were stored in every currency (AUDIT.md finding 5).
// Dry run unless `apply` is true. Idempotent: only transactions missing a conversion are selected, and each update
// is guarded by the same condition, so re-running (or running twice at once) never converts a transaction twice.

const MISSING_CONVERSION_FILTER = {
  $or: SUPPORTED_CURRENCIES.map((code) => ({ [`convertedAmounts.${code}`]: { $exists: false } })),
};

const toIsoDay = (date) => new Date(date).toISOString().slice(0, 10);

export const backfillTransactionCurrencies = async ({ apply = false, batchSize = 200, sampleSize = 5 } = {}) => {
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    candidates: 0,
    converted: 0,
    updated: 0,
    failed: 0,
    rateRequests: 0,
    byCurrency: {},
    failures: [],
    samples: [],
  };
  // One rate lookup per currency and day; the conversion is then applied to each transaction's amount.
  const ratesByCurrencyDay = new Map();
  let lastId = null;

  for (;;) {
    const batch = await Transaction.find({
      ...MISSING_CONVERSION_FILTER,
      ...(lastId ? { _id: { $gt: lastId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(batchSize)
      .select('_id amount currency date')
      .lean();

    if (batch.length === 0) {
      break;
    }

    lastId = batch[batch.length - 1]._id;
    const updates = [];

    for (const transaction of batch) {
      report.candidates += 1;
      const currency = transaction.currency ?? 'RON';
      const day = toIsoDay(transaction.date);
      const key = `${currency}:${day}`;
      report.byCurrency[currency] = (report.byCurrency[currency] ?? 0) + 1;

      if (!ratesByCurrencyDay.has(key)) {
        report.rateRequests += 1;
        ratesByCurrencyDay.set(
          key,
          buildCurrencyConversion({ amount: 1, currency, date: transaction.date }).catch((error) => ({ error })),
        );
      }

      const unitConversion = await ratesByCurrencyDay.get(key);

      if (unitConversion.error) {
        report.failed += 1;
        report.failures.push({ id: String(transaction._id), currency, date: day, reason: unitConversion.error.message });
        continue;
      }

      const conversion = {
        ...unitConversion,
        convertedAmounts: Object.fromEntries(
          SUPPORTED_CURRENCIES.map((code) => [
            code,
            Number((transaction.amount * unitConversion.fxRates[code]).toFixed(2)),
          ]),
        ),
      };
      report.converted += 1;

      if (report.samples.length < sampleSize) {
        report.samples.push({ id: String(transaction._id), amount: transaction.amount, currency, date: day, ...conversion });
      }

      updates.push({
        updateOne: {
          filter: { _id: transaction._id, ...MISSING_CONVERSION_FILTER },
          update: { $set: conversion },
        },
      });
    }

    if (apply && updates.length > 0) {
      const result = await Transaction.bulkWrite(updates, { ordered: false });
      report.updated += result.modifiedCount;
    }
  }

  return report;
};

export const parseBackfillArgs = (args) => {
  const options = { apply: false, batchSize: 200 };

  for (const arg of args) {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.slice('--batch-size='.length));

      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --batch-size: ${arg}`);
      }

      options.batchSize = value;
    } else {
      throw new Error(`Unknown argument: ${arg} (use --apply and/or --batch-size=N)`);
    }
  }

  return options;
};
