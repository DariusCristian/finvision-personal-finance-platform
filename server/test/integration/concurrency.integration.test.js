import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { InvestFunding } from '../../src/models/invest-funding.js';
import { InvestingWalletLedger } from '../../src/models/investing-wallet-ledger.js';
import { InvestingWallet } from '../../src/models/investing-wallet.js';
import { PortfolioAccount } from '../../src/models/portfolio-account.js';
import { PortfolioHolding } from '../../src/models/portfolio-holding.js';
import { PortfolioTrade } from '../../src/models/portfolio-trade.js';
import { Transaction } from '../../src/models/transaction.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

// Finding 1 (AUDIT.md): each test fires concurrent requests whose total exceeds the balance or holding.
// Tests stay `todo` until the part of PLAN-finding-1.md that fixes their spot enables them.
const TODO_PART_5 = { todo: 'finding 1, part 5: top-ups (spots A, B)' };
const TODO_PART_6 = { todo: 'finding 1, part 6: orders (spots E, F, G)' };

const CONCURRENT_REQUESTS = 5;
// Auto-fund and first-buy holding creation have no uncached external call between check and write, so their race
// window is only DB round-trips; more requests make them fail reliably on unfixed code.
const CONCURRENT_NARROW_RACE_REQUESTS = 20;
const EUR_PER_RON = 0.2;
const EUR_PER_USD = 0.9;
const COIN_PRICE_EUR = 100;
const STOCK_PRICE_USD = 100;
const STOCK_PRICE_EUR = STOCK_PRICE_USD * EUR_PER_USD;
const PROVIDER_LATENCY_MS = 150;

process.env.COINGECKO_API_KEY = 'test-coingecko-key';
process.env.FINNHUB_API_KEY = 'test-finnhub-key';

const jsonResponse = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });

const stubbedFetch = async (input) => {
  const url = new URL(String(input));
  await new Promise((resolve) => setTimeout(resolve, PROVIDER_LATENCY_MS));

  if (url.hostname === 'api.frankfurter.dev') {
    const base = url.searchParams.get('from') ?? url.searchParams.get('base');
    const rate = base === 'RON' ? EUR_PER_RON : EUR_PER_USD;
    return jsonResponse({ base, date: '2026-10-14', rates: { EUR: rate } });
  }

  if (url.hostname === 'api.coingecko.com' && url.pathname.endsWith('/simple/price')) {
    const ids = url.searchParams.get('ids').split(',');
    return jsonResponse(Object.fromEntries(ids.map((id) => [id, { eur: COIN_PRICE_EUR, eur_24h_change: 0 }])));
  }

  if (url.hostname === 'finnhub.io' && url.pathname.endsWith('/quote')) {
    return jsonResponse({ c: STOCK_PRICE_USD, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: STOCK_PRICE_USD, t: 0 });
  }

  throw new Error(`blocked external call in test: ${url.hostname}${url.pathname}`);
};

let runtime;
let realFetch;
let userCounter = 0;

const registerAndLogin = async () => {
  userCounter += 1;
  const response = await request(runtime.app).post('/api/v1/auth/register').send({
    email: `concurrency${userCounter}@example.com`,
    password: 'Password123',
    displayName: 'Concurrency User',
  });

  return {
    userId: response.body.data.user.id,
    auth: { Authorization: `Bearer ${response.body.data.accessToken}` },
  };
};

const send = (method, path, auth, body) => {
  const pending = request(runtime.app)[method](`/api/v1${path}`).set(auth);
  return body === undefined ? pending : pending.send(body);
};

const fireConcurrently = (requestFactory, count = CONCURRENT_REQUESTS) =>
  Promise.all(Array.from({ length: count }, () => requestFactory()));

const countStatuses = (responses) =>
  responses.reduce((counts, response) => {
    const key = response.status === 200 ? '200' : `${response.status} ${response.body?.error?.code ?? ''}`.trim();
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

const expectOk = async (pending) => {
  const response = await pending;
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response;
};

const getAccount = (userId, accountType, mode) => PortfolioAccount.findOne({ userId, accountType, mode }).lean();

before(async () => {
  realFetch = global.fetch;
  global.fetch = stubbedFetch;
  runtime = await getTestRuntime();
});

beforeEach(async () => {
  await runtime.resetDatabase();
});

after(async () => {
  global.fetch = realFetch;
  await releaseTestRuntime();
});

const assertTopUpRace = async ({ modePath, topUpPath, accountType }) => {
  const { userId, auth } = await registerAndLogin();
  await expectOk(send('post', modePath, auth, { mode: 'funded' }));
  await expectOk(send('post', '/investing-wallet/deposit', auth, { amountRON: 1000 }));

  const responses = await fireConcurrently(() => send('post', topUpPath, auth, { amountRON: 300 }));

  assert.deepEqual(countStatuses(responses), { 200: 3, '400 INSUFFICIENT_FUNDS': 2 });

  const wallet = await InvestingWallet.findOne({ userId }).lean();
  const account = await getAccount(userId, accountType, 'funded');
  const ledger = await InvestingWalletLedger.find({ userId, type: 'fx_convert_to_eur' }).lean();
  const fundings = await InvestFunding.countDocuments({ userId });

  assert.equal(wallet.balance, 100);
  assert.equal(account.cashBalance, 3 * 300 * EUR_PER_RON);
  assert.equal(ledger.length, 3);
  assert.equal(ledger.reduce((sum, entry) => sum + entry.amountRON, 0), -900);
  assert.equal(fundings, 3);
};

test('spot A: concurrent crypto top-ups cannot spend more than the wallet holds', TODO_PART_5, async () => {
  await assertTopUpRace({
    modePath: '/invest/crypto/mode',
    topUpPath: '/invest/crypto/topup-from-wallet',
    accountType: 'crypto',
  });
});

test('spot B: concurrent stocks top-ups cannot spend more than the wallet holds', TODO_PART_5, async () => {
  await assertTopUpRace({
    modePath: '/market/stocks/mode',
    topUpPath: '/market/stocks/topup-from-wallet',
    accountType: 'stocks',
  });
});

test('spot C: concurrent deposits are all credited to the wallet', async () => {
  const { userId, auth } = await registerAndLogin();
  await expectOk(send('get', '/investing-wallet', auth));

  const responses = await fireConcurrently(() => send('post', '/investing-wallet/deposit', auth, { amountRON: 100 }));

  assert.deepEqual(countStatuses(responses), { 200: 5 });

  const wallet = await InvestingWallet.findOne({ userId }).lean();
  const ledgerCount = await InvestingWalletLedger.countDocuments({ userId, type: 'deposit' });
  const expenseCount = await Transaction.countDocuments({ userId, type: 'expense' });

  assert.equal(wallet.balance, 500);
  assert.equal(ledgerCount, 5);
  assert.equal(expenseCount, 5);
});

test('spot D: concurrent wallet reads apply the monthly auto-fund only once', async () => {
  const { userId, auth } = await registerAndLogin();
  await expectOk(send('get', '/investing-wallet', auth));

  // Set directly: autoFundDayOfMonth is limited to 1..28 by the API, but the test must run on any day.
  await InvestingWallet.updateOne(
    { userId },
    { autoFundEnabled: true, autoFundAmount: 50, autoFundDayOfMonth: new Date().getUTCDate(), lastAutoFundAt: null },
  );

  const responses = await fireConcurrently(
    () => send('get', '/investing-wallet', auth),
    CONCURRENT_NARROW_RACE_REQUESTS,
  );

  assert.deepEqual(countStatuses(responses), { 200: CONCURRENT_NARROW_RACE_REQUESTS });

  const wallet = await InvestingWallet.findOne({ userId }).lean();
  const ledgerCount = await InvestingWalletLedger.countDocuments({ userId, type: 'autofund' });
  const expenseCount = await Transaction.countDocuments({ userId, type: 'expense' });

  assert.equal(wallet.balance, 50);
  assert.equal(ledgerCount, 1);
  assert.equal(expenseCount, 1);
});

const assertBuyRace = async ({ modePath, budgetPath, orderPath, accountType, order, priceEUR }) => {
  const { userId, auth } = await registerAndLogin();
  await expectOk(send('post', modePath, auth, { mode: 'demo' }));
  await expectOk(send('post', budgetPath, auth, { amountEUR: 4 * priceEUR }));
  // Buy once first so the holding exists; first-buy creation races are covered separately.
  await expectOk(send('post', orderPath, auth, { ...order, side: 'buy', quantity: 1 }));

  const responses = await fireConcurrently(() => send('post', orderPath, auth, { ...order, side: 'buy', quantity: 1 }));

  assert.deepEqual(countStatuses(responses), { 200: 3, '400 INSUFFICIENT_FUNDS': 2 });

  const account = await getAccount(userId, accountType, 'demo');
  const holdings = await PortfolioHolding.find({ userId, accountType, mode: 'demo' }).lean();
  const trades = await PortfolioTrade.countDocuments({ userId, accountType, mode: 'demo', side: 'buy' });

  assert.equal(account.cashBalance, 0);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].quantity, 4);
  assert.equal(holdings[0].avgCost, priceEUR);
  assert.equal(trades, 4);
};

const assertFirstBuyRace = async ({ modePath, budgetPath, orderPath, accountType, order, priceEUR }) => {
  const { userId, auth } = await registerAndLogin();
  await expectOk(send('post', modePath, auth, { mode: 'demo' }));
  await expectOk(send('post', budgetPath, auth, { amountEUR: 2 * CONCURRENT_NARROW_RACE_REQUESTS * priceEUR }));

  const responses = await fireConcurrently(
    () => send('post', orderPath, auth, { ...order, side: 'buy', quantity: 1 }),
    CONCURRENT_NARROW_RACE_REQUESTS,
  );

  assert.deepEqual(countStatuses(responses), { 200: CONCURRENT_NARROW_RACE_REQUESTS });

  const account = await getAccount(userId, accountType, 'demo');
  const holdings = await PortfolioHolding.find({ userId, accountType, mode: 'demo' }).lean();

  assert.equal(account.cashBalance, CONCURRENT_NARROW_RACE_REQUESTS * priceEUR);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].quantity, CONCURRENT_NARROW_RACE_REQUESTS);
};

const assertSellRace = async ({ modePath, budgetPath, orderPath, accountType, order, priceEUR }) => {
  const { userId, auth } = await registerAndLogin();
  await expectOk(send('post', modePath, auth, { mode: 'demo' }));
  await expectOk(send('post', budgetPath, auth, { amountEUR: 1000 }));
  await expectOk(send('post', orderPath, auth, { ...order, side: 'buy', quantity: 2 }));

  const responses = await fireConcurrently(() => send('post', orderPath, auth, { ...order, side: 'sell', quantity: 1 }));

  assert.deepEqual(countStatuses(responses), { 200: 2, '400 INSUFFICIENT_HOLDINGS': 3 });

  const account = await getAccount(userId, accountType, 'demo');
  const holdings = await PortfolioHolding.countDocuments({ userId, accountType, mode: 'demo' });
  const sellTrades = await PortfolioTrade.countDocuments({ userId, accountType, mode: 'demo', side: 'sell' });

  assert.equal(account.cashBalance, 1000);
  assert.equal(holdings, 0);
  assert.equal(sellTrades, 2);
};

const cryptoOrderSetup = {
  modePath: '/invest/crypto/mode',
  budgetPath: '/invest/crypto/demo/set-budget',
  orderPath: '/invest/crypto/order',
  accountType: 'crypto',
  order: { coinId: 'bitcoin', symbol: 'BTC' },
  priceEUR: COIN_PRICE_EUR,
};

const stockOrderSetup = {
  modePath: '/market/stocks/mode',
  budgetPath: '/market/stocks/demo/set-budget',
  orderPath: '/market/stocks/order',
  accountType: 'stocks',
  order: { symbol: 'AAPL' },
  priceEUR: STOCK_PRICE_EUR,
};

test('spot E: concurrent crypto buys cannot spend more cash than the account holds', TODO_PART_6, async () => {
  await assertBuyRace(cryptoOrderSetup);
});

test('spot E: concurrent first buys of a new coin create one holding', TODO_PART_6, async () => {
  await assertFirstBuyRace(cryptoOrderSetup);
});

test('spot F: concurrent crypto sells cannot sell more than the holding', TODO_PART_6, async () => {
  await assertSellRace(cryptoOrderSetup);
});

test('spot G: concurrent stock buys cannot spend more cash than the account holds', TODO_PART_6, async () => {
  await assertBuyRace(stockOrderSetup);
});

test('spot G: concurrent first buys of a new stock create one holding', TODO_PART_6, async () => {
  await assertFirstBuyRace(stockOrderSetup);
});

test('spot G: concurrent stock sells cannot sell more than the holding', TODO_PART_6, async () => {
  await assertSellRace(stockOrderSetup);
});

test('spot H: concurrent first use creates exactly one wallet and one account', async () => {
  const { userId, auth } = await registerAndLogin();

  const responses = await Promise.all([
    ...Array.from({ length: CONCURRENT_REQUESTS }, () => send('get', '/investing-wallet', auth)),
    ...Array.from({ length: CONCURRENT_REQUESTS }, () => send('get', '/invest/crypto/account', auth)),
    ...Array.from({ length: CONCURRENT_REQUESTS }, () => send('get', '/market/stocks/account', auth)),
  ]);

  assert.deepEqual(countStatuses(responses), { 200: 15 });
  assert.equal(await InvestingWallet.countDocuments({ userId }), 1);
});
