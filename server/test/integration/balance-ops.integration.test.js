import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';

import { InvestingWallet } from '../../src/models/investing-wallet.js';
import { PortfolioAccount } from '../../src/models/portfolio-account.js';
import { PortfolioHolding } from '../../src/models/portfolio-holding.js';
import {
  addToHolding,
  claimAutoFund,
  creditAccountCash,
  creditWallet,
  debitAccountCash,
  debitWallet,
  ensureInvestingWallet,
  ensurePortfolioAccount,
  removeFromHolding,
} from '../../src/services/balance-ops.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const newUserId = () => new mongoose.Types.ObjectId();
const accountKey = (userId) => ({ userId, accountType: 'crypto', mode: 'demo' });
const holdingKey = (userId) => ({ userId, accountType: 'crypto', mode: 'demo', assetType: 'crypto', coinId: 'bitcoin' });

const createAccount = (userId, startingCashBalance) =>
  ensurePortfolioAccount({ ...accountKey(userId), baseCurrency: 'EUR', startingCashBalance });

before(async () => {
  runtime = await getTestRuntime();
});

beforeEach(async () => {
  await runtime.resetDatabase();
});

after(async () => {
  await releaseTestRuntime();
});

test('ensureInvestingWallet creates a wallet with schema defaults once and returns it afterwards', async () => {
  const userId = newUserId();

  const created = await ensureInvestingWallet(userId);
  const again = await ensureInvestingWallet(userId);

  assert.equal(created.balance, 0);
  assert.equal(created.currency, 'RON');
  assert.equal(created.autoFundDayOfMonth, 1);
  assert.ok(created.createdAt instanceof Date);
  assert.equal(String(again._id), String(created._id));
  assert.equal(again.updatedAt.getTime(), created.updatedAt.getTime());
  assert.equal(await InvestingWallet.countDocuments({ userId }), 1);
});

test('concurrent ensureInvestingWallet calls create exactly one wallet', async () => {
  const userId = newUserId();

  const wallets = await Promise.all(Array.from({ length: 20 }, () => ensureInvestingWallet(userId)));

  assert.equal(new Set(wallets.map((wallet) => String(wallet._id))).size, 1);
  assert.equal(await InvestingWallet.countDocuments({ userId }), 1);
});

test('ensurePortfolioAccount sets starting cash only on insert', async () => {
  const userId = newUserId();

  const created = await createAccount(userId, 5000);
  await debitAccountCash(accountKey(userId), 100);
  const again = await createAccount(userId, 5000);

  assert.equal(created.cashBalance, 5000);
  assert.equal(again.cashBalance, 4900);
  assert.equal(await PortfolioAccount.countDocuments(accountKey(userId)), 1);
});

test('ensurePortfolioAccount repairs a wrong base currency', async () => {
  const userId = newUserId();
  await createAccount(userId, 0);
  await PortfolioAccount.collection.updateOne(accountKey(userId), { $set: { baseCurrency: 'USD' } });

  const account = await createAccount(userId, 0);

  assert.equal(account.baseCurrency, 'EUR');
  assert.equal((await PortfolioAccount.findOne(accountKey(userId)).lean()).baseCurrency, 'EUR');
});

test('wallet credits and debits round to cents without float drift', async () => {
  const userId = newUserId();
  const created = await ensureInvestingWallet(userId);

  await creditWallet(userId, 0.1);
  const credited = await creditWallet(userId, 0.2);
  const debited = await debitWallet(userId, 0.1 + 0.2);

  assert.equal(credited.balance, 0.3);
  assert.equal(debited.balance, 0);
  assert.ok(debited.updatedAt > created.updatedAt);
});

test('debitWallet returns null and leaves the balance unchanged when funds are insufficient', async () => {
  const userId = newUserId();
  await ensureInvestingWallet(userId);
  await creditWallet(userId, 50);

  const result = await debitWallet(userId, 50.01);

  assert.equal(result, null);
  assert.equal((await InvestingWallet.findOne({ userId }).lean()).balance, 50);
});

test('concurrent debitWallet calls never overspend', async () => {
  const userId = newUserId();
  await ensureInvestingWallet(userId);
  await creditWallet(userId, 1000);

  const results = await Promise.all(Array.from({ length: 20 }, () => debitWallet(userId, 300)));

  assert.equal(results.filter(Boolean).length, 3);
  assert.equal((await InvestingWallet.findOne({ userId }).lean()).balance, 100);
});

test('debitAccountCash returns null when cash is insufficient; creditAccountCash adds cash', async () => {
  const userId = newUserId();
  await createAccount(userId, 100);

  assert.equal(await debitAccountCash(accountKey(userId), 100.01), null);

  const credited = await creditAccountCash(accountKey(userId), 0.05);
  const debited = await debitAccountCash(accountKey(userId), 100.05);

  assert.equal(credited.cashBalance, 100.05);
  assert.equal(debited.cashBalance, 0);
});

test('addToHolding creates a holding and then keeps a weighted average cost', async () => {
  const userId = newUserId();
  const insertFields = { symbol: 'BTC', name: null };

  const created = await addToHolding(holdingKey(userId), { quantity: 1, price: 100, insertFields });
  const updated = await addToHolding(holdingKey(userId), {
    quantity: 3,
    price: 200,
    insertFields: { symbol: 'IGNORED', name: 'Ignored' },
  });

  assert.equal(created.quantity, 1);
  assert.equal(created.avgCost, 100);
  assert.equal(created.symbol, 'BTC');
  assert.ok(created.createdAt instanceof Date);
  assert.ok(updated.updatedAt >= created.updatedAt);
  assert.equal(updated.createdAt.getTime(), created.createdAt.getTime());
  assert.equal(updated.quantity, 4);
  assert.equal(updated.avgCost, 175);
  assert.equal(updated.symbol, 'BTC');
  assert.equal(updated.name, null);
  assert.equal(await PortfolioHolding.countDocuments({ userId }), 1);
});

test('removeFromHolding returns null when quantity is insufficient and deletes an emptied holding', async () => {
  const userId = newUserId();
  await addToHolding(holdingKey(userId), { quantity: 2, price: 100, insertFields: { symbol: 'BTC' } });

  assert.equal(await removeFromHolding(holdingKey(userId), 2.5), null);

  const partial = await removeFromHolding(holdingKey(userId), 0.5);
  const emptied = await removeFromHolding(holdingKey(userId), 1.5);

  assert.equal(partial.quantity, 1.5);
  assert.equal(emptied.quantity, 0);
  assert.equal(await PortfolioHolding.countDocuments({ userId }), 0);
});

test('claimAutoFund credits once per month and only on the configured day', async () => {
  const userId = newUserId();
  const wallet = await ensureInvestingWallet(userId);
  const now = new Date(Date.UTC(2026, 9, 14, 12));
  await InvestingWallet.updateOne(
    { _id: wallet._id },
    { autoFundEnabled: true, autoFundAmount: 50, autoFundDayOfMonth: 14, lastAutoFundAt: new Date(Date.UTC(2026, 8, 14)) },
  );

  assert.equal(await claimAutoFund(wallet._id, { now: new Date(Date.UTC(2026, 9, 13, 12)) }), null);

  const claims = await Promise.all(Array.from({ length: 20 }, () => claimAutoFund(wallet._id, { now })));
  const claimed = claims.filter(Boolean);

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].balance, 50);
  assert.equal(claimed[0].lastAutoFundAt.getTime(), now.getTime());
  assert.equal(await claimAutoFund(wallet._id, { now: new Date(Date.UTC(2026, 9, 14, 18)) }), null);
});

test('claimAutoFund does nothing when auto-fund is disabled', async () => {
  const wallet = await ensureInvestingWallet(newUserId());

  assert.equal(await claimAutoFund(wallet._id, { now: new Date(Date.UTC(2026, 9, 1)) }), null);
});
