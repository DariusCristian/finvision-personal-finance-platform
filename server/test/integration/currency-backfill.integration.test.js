import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';

import { Transaction } from '../../src/models/transaction.js';
import { frankfurterStubResponse } from '../support/fx-stub.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

// Stubbed rates only; one date can be made to fail. Installed before the runtime so it replaces the default stub.
const fxCalls = [];
let failingDate = null;
let realFetch;

const stubFetch = async (input, init) => {
  const url = new URL(String(input));

  if (url.hostname === 'api.frankfurter.dev') {
    fxCalls.push(url.pathname);
    return failingDate && url.pathname.includes(failingDate)
      ? new Response('upstream error', { status: 503 })
      : frankfurterStubResponse(url);
  }

  return realFetch(input, init);
};

let runtime;
// Loaded after the runtime starts, as a precaution: src modules must not load env before the in-memory URI is set.
let backfillTransactionCurrencies;
let parseBackfillArgs;

const userId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();

// Inserted directly, like transactions created before conversions were stored.
const insertLegacy = (docs) =>
  Transaction.collection.insertMany(
    docs.map(({ amount, currency, date }) => ({
      userId,
      categoryId,
      type: 'expense',
      amount,
      currency,
      date: new Date(`${date}T12:00:00.000Z`),
      recurrence: 'none',
      isRecurring: false,
    })),
  );

before(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch;
  runtime = await getTestRuntime();
  ({ backfillTransactionCurrencies, parseBackfillArgs } = await import('../../src/services/currency-backfill.js'));
});

beforeEach(async () => {
  await runtime.resetDatabase();
  fxCalls.length = 0;
  failingDate = null;
});

after(async () => {
  globalThis.fetch = realFetch;
  await releaseTestRuntime();
});

test('dry run reports what would change and writes nothing', async () => {
  await insertLegacy([
    { amount: 100, currency: 'EUR', date: '2025-06-02' },
    { amount: 50, currency: 'RON', date: '2025-06-02' },
  ]);

  const report = await backfillTransactionCurrencies();

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.candidates, 2);
  assert.equal(report.converted, 2);
  assert.equal(report.updated, 0);
  assert.deepEqual(report.samples[0].convertedAmounts, { RON: 500, EUR: 100, USD: 111.11 });
  assert.equal(await Transaction.countDocuments({ convertedAmounts: { $exists: true } }), 0);
});

test('--apply writes conversions with the transaction date rates, in batches, and is idempotent', async () => {
  await insertLegacy([
    { amount: 100, currency: 'EUR', date: '2025-06-02' },
    { amount: 200, currency: 'EUR', date: '2025-06-02' },
    { amount: 50, currency: 'RON', date: '2025-06-03' },
    { amount: 10, currency: 'USD', date: '2025-06-03' },
    { amount: 20, currency: 'USD', date: '2025-06-04' },
  ]);

  const first = await backfillTransactionCurrencies({ apply: true, batchSize: 2 });
  const stored = await Transaction.find().sort({ amount: 1 }).lean();
  const second = await backfillTransactionCurrencies({ apply: true });

  assert.equal(first.updated, 5);
  assert.equal(first.rateRequests, 4, 'one lookup per currency and day');
  assert.ok(fxCalls.every((path) => /\/v1\/2025-06-0[234]$/.test(path)), 'historical endpoints only');
  assert.deepEqual(stored.find((doc) => doc.amount === 200).convertedAmounts, { RON: 1000, EUR: 200, USD: 222.22 });
  assert.equal(stored.find((doc) => doc.amount === 10).convertedAmounts.EUR, 9);
  assert.equal(stored.find((doc) => doc.amount === 50).fxRateDate, '2025-06-03');
  assert.equal(second.candidates, 0);
  assert.equal(second.updated, 0);
});

test('transactions that already have conversions are left untouched', async () => {
  await Transaction.collection.insertOne({
    userId,
    categoryId,
    type: 'expense',
    amount: 100,
    currency: 'EUR',
    date: new Date('2025-06-02T12:00:00.000Z'),
    convertedAmounts: { RON: 497.5, EUR: 100, USD: 108 },
    fxRates: { RON: 4.975, EUR: 1, USD: 1.08 },
    fxRateDate: '2025-06-02',
    fxProvider: 'frankfurter',
  });

  const report = await backfillTransactionCurrencies({ apply: true });

  assert.equal(report.candidates, 0);
  assert.equal((await Transaction.findOne().lean()).convertedAmounts.RON, 497.5);
});

test('a date whose rate is unavailable is skipped and reported; the rest is applied', async () => {
  failingDate = '2025-06-05';
  await insertLegacy([
    { amount: 100, currency: 'EUR', date: '2025-06-05' },
    { amount: 100, currency: 'EUR', date: '2025-06-06' },
  ]);

  const report = await backfillTransactionCurrencies({ apply: true });

  assert.equal(report.failed, 1);
  assert.equal(report.failures[0].date, '2025-06-05');
  assert.equal(report.updated, 1);
  assert.equal(await Transaction.countDocuments({ convertedAmounts: { $exists: false } }), 1);
});

test('backfill arguments default to a dry run and only accept known flags', () => {
  assert.deepEqual(parseBackfillArgs([]), { apply: false, batchSize: 200 });
  assert.deepEqual(parseBackfillArgs(['--apply', '--batch-size=50']), { apply: true, batchSize: 50 });
  assert.throws(() => parseBackfillArgs(['--aply']), /Unknown argument/);
  assert.throws(() => parseBackfillArgs(['--batch-size=0']), /Invalid --batch-size/);
});
