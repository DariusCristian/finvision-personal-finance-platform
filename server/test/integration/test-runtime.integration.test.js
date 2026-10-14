import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { InvestingWallet } from '../../src/models/investing-wallet.js';
import { PortfolioAccount } from '../../src/models/portfolio-account.js';
import { PortfolioHolding } from '../../src/models/portfolio-holding.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const getUniqueIndexKeys = async (model) => {
  const indexes = await model.collection.indexes();

  return indexes.filter((index) => index.unique).map((index) => Object.keys(index.key).join(','));
};

before(async () => {
  runtime = await getTestRuntime();
});

after(async () => {
  await releaseTestRuntime();
});

test('test runtime is a replica set so transactions are available', async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });

  assert.equal(typeof hello.setName, 'string');
});

test('unique indexes on wallet, account and holding survive a database reset', async () => {
  await runtime.resetDatabase();
  await runtime.resetDatabase();

  assert.deepEqual(await getUniqueIndexKeys(InvestingWallet), ['userId']);
  assert.deepEqual(await getUniqueIndexKeys(PortfolioAccount), ['userId,accountType,mode']);
  assert.deepEqual((await getUniqueIndexKeys(PortfolioHolding)).sort(), [
    'userId,accountType,mode,assetType,coinId',
    'userId,accountType,mode,assetType,symbol',
  ]);
});

test('duplicate wallet insert is rejected after a database reset', async () => {
  await runtime.resetDatabase();

  const userId = new mongoose.Types.ObjectId();
  await InvestingWallet.create({ userId });

  await assert.rejects(InvestingWallet.create({ userId }), (error) => error.code === 11000);
});
