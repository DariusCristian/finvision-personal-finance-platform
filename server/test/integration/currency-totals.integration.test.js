import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { Transaction } from '../../src/models/transaction.js';
import { frankfurterStubResponse, testRate } from '../support/fx-stub.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

// Counts Frankfurter calls and can simulate an outage for one date. Installed before the runtime starts, so the
// runtime keeps it instead of its default stub.
const fxCalls = [];
let failingDate = null;
let realFetch;

const countingFetch = async (input, init) => {
  const url = new URL(String(input));

  if (url.hostname === 'api.frankfurter.dev') {
    fxCalls.push(url.pathname + url.search);

    if (failingDate && url.pathname.includes(failingDate)) {
      return new Response('upstream error', { status: 503 });
    }

    return frankfurterStubResponse(url);
  }

  return realFetch(input, init);
};

let runtime;
let auth;

const PAST_DAY = '2026-03-10';

const registerAndLogin = async (baseCurrency = 'RON') => {
  const response = await request(runtime.app).post('/api/v1/auth/register').send({
    email: 'currency@example.com',
    password: 'Password123',
    displayName: 'Currency User',
    baseCurrency,
  });

  auth = { Authorization: `Bearer ${response.body.data.accessToken}` };
};

const expenseCategoryId = async () => {
  const response = await request(runtime.app).get('/api/v1/categories').set(auth).expect(200);
  return response.body.data.categories.find((category) => category.type === 'expense').id;
};

const createExpense = async ({ amount, currency, date = PAST_DAY, description = '' }) => {
  const response = await request(runtime.app)
    .post('/api/v1/transactions')
    .set(auth)
    .send({ type: 'expense', categoryId: await expenseCategoryId(), amount, currency, date, description });

  return response;
};

const summaryFor = async (day = PAST_DAY) => {
  const [year, month] = day.split('-').map(Number);
  const response = await request(runtime.app)
    .get(`/api/v1/budget/summary?year=${year}&month=${month}`)
    .set(auth)
    .expect(200);

  return response.body.data;
};

const setBaseCurrency = (baseCurrency) =>
  request(runtime.app).patch('/api/v1/profile').set(auth).send({ baseCurrency }).expect(200);

before(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = countingFetch;
  runtime = await getTestRuntime();
});

beforeEach(async () => {
  await runtime.resetDatabase();
  fxCalls.length = 0;
  failingDate = null;
  await registerAndLogin();
});

after(async () => {
  globalThis.fetch = realFetch;
  await releaseTestRuntime();
});

test('a transaction stores its amount in RON, EUR and USD with the rates and rate date used', async () => {
  const response = await createExpense({ amount: 100, currency: 'EUR' });
  assert.equal(response.status, 201, JSON.stringify(response.body));

  const stored = await Transaction.findOne().lean();

  assert.deepEqual(stored.convertedAmounts, {
    RON: 500,
    EUR: 100,
    USD: Number((100 * testRate('EUR', 'USD')).toFixed(2)),
  });
  assert.equal(stored.fxRates.EUR, 1);
  assert.equal(stored.fxRates.RON, 5);
  assert.equal(stored.fxRateDate, PAST_DAY);
  assert.equal(stored.fxProvider, 'frankfurter');
  assert.ok(fxCalls.some((call) => call.startsWith(`/v1/${PAST_DAY}?`)), 'uses the transaction date rates');
});

test('budget totals add mixed currencies in the base currency (100 RON + 100 EUR)', async () => {
  await createExpense({ amount: 100, currency: 'RON' });
  await createExpense({ amount: 100, currency: 'EUR' });

  const summary = await summaryFor();

  assert.equal(summary.currency, 'RON');
  assert.equal(summary.expenseTotal, 600);
});

test('switching the base currency changes the totals without recomputing or refetching rates', async () => {
  await createExpense({ amount: 100, currency: 'RON' });
  await createExpense({ amount: 100, currency: 'EUR' });
  const storedBefore = await Transaction.find().sort({ amount: 1, currency: 1 }).lean();
  fxCalls.length = 0;

  await setBaseCurrency('EUR');
  const inEur = await summaryFor();
  await setBaseCurrency('USD');
  const inUsd = await summaryFor();

  assert.equal(inEur.currency, 'EUR');
  assert.equal(inEur.expenseTotal, 120);
  assert.equal(inUsd.currency, 'USD');
  assert.equal(
    inUsd.expenseTotal,
    Number(
      (Number((100 * testRate('RON', 'USD')).toFixed(2)) + Number((100 * testRate('EUR', 'USD')).toFixed(2))).toFixed(
        2,
      ),
    ),
  );
  assert.equal(fxCalls.length, 0, 'no FX calls when switching or reading totals');
  assert.deepEqual(await Transaction.find().sort({ amount: 1, currency: 1 }).lean(), storedBefore);
});

test('editing amount, currency or date re-converts; editing only the description does not', async () => {
  const created = await createExpense({ amount: 100, currency: 'EUR' });
  const id = created.body.data.transaction.id;
  const categoryId = await expenseCategoryId();
  const edit = (changes) =>
    request(runtime.app)
      .patch(`/api/v1/transactions/${id}`)
      .set(auth)
      .send({ type: 'expense', categoryId, amount: 100, currency: 'EUR', date: PAST_DAY, ...changes })
      .expect(200);

  fxCalls.length = 0;
  await edit({ description: 'renamed' });
  assert.equal(fxCalls.length, 0);

  await edit({ amount: 50, currency: 'USD', date: '2026-03-11' });
  const stored = await Transaction.findById(id).lean();

  assert.equal(stored.convertedAmounts.USD, 50);
  assert.equal(stored.convertedAmounts.EUR, 45);
  assert.equal(stored.fxRateDate, '2026-03-11');
});

test('an unavailable exchange rate fails clearly with 502 and stores nothing', async () => {
  failingDate = '2025-02-03';

  const response = await createExpense({ amount: 100, currency: 'EUR', date: failingDate });

  assert.equal(response.status, 502);
  assert.equal(response.body.error.code, 'FX_PROVIDER_ERROR');
  assert.equal(await Transaction.countDocuments(), 0);
});

test('Finny net worth converts the EUR investing accounts into the base currency', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await createExpense({ amount: 100, currency: 'RON', date: today });
  await createExpense({ amount: 100, currency: 'EUR', date: today });
  // Demo crypto starts with 5000 EUR cash.
  await request(runtime.app).post('/api/v1/invest/crypto/mode').set(auth).send({ mode: 'demo' }).expect(200);

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set(auth)
    .send({ message: 'What is my net worth?', contextType: 'general' })
    .expect(200);

  // Budget balance -600 RON + 5000 EUR × 5 = 24400 RON.
  assert.match(response.body.data.card.summary, /24400\.00 RON/);
});
