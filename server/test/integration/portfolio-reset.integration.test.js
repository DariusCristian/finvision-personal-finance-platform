import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { InvestFunding } from '../../src/models/invest-funding.js';
import { PortfolioAccount } from '../../src/models/portfolio-account.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const registerAndLogin = async () => {
  const response = await request(runtime.app).post('/api/v1/auth/register').send({
    email: 'reset@example.com',
    password: 'Password123',
    displayName: 'Reset User',
  });

  return {
    userId: response.body.data.user.id,
    auth: { Authorization: `Bearer ${response.body.data.accessToken}` },
  };
};

const RESET_ENDPOINTS = [
  { name: 'crypto', modePath: '/api/v1/invest/crypto/mode', resetPath: '/api/v1/invest/reset', accountType: 'crypto' },
  { name: 'stocks', modePath: '/api/v1/market/stocks/mode', resetPath: '/api/v1/market/stocks/reset', accountType: 'stocks' },
];

before(async () => {
  runtime = await getTestRuntime();
});

beforeEach(async () => {
  await runtime.resetDatabase();
});

after(async () => {
  await releaseTestRuntime();
});

for (const { name, modePath, resetPath, accountType } of RESET_ENDPOINTS) {
  test(`${name} reset is rejected in funded mode and keeps the funded balance`, async () => {
    const { userId, auth } = await registerAndLogin();
    await request(runtime.app).post(modePath).set(auth).send({ mode: 'funded' }).expect(200);
    await PortfolioAccount.updateOne({ userId, accountType, mode: 'funded' }, { cashBalance: 250 });
    await InvestFunding.create({
      userId,
      mode: 'funded',
      fromCurrency: 'RON',
      fromAmount: 1250,
      toCurrency: 'EUR',
      toAmount: 250,
      rate: 0.2,
      provider: 'frankfurter',
    });

    const response = await request(runtime.app).post(resetPath).set(auth).expect(400);

    assert.equal(response.body.error.code, 'RESET_NOT_ALLOWED_IN_FUNDED_MODE');
    assert.equal((await PortfolioAccount.findOne({ userId, accountType, mode: 'funded' }).lean()).cashBalance, 250);
    assert.equal(await InvestFunding.countDocuments({ userId }), 1);
  });

  test(`${name} reset in demo mode restores the demo starting balance`, async () => {
    const { userId, auth } = await registerAndLogin();
    await request(runtime.app).post(modePath).set(auth).send({ mode: 'demo' }).expect(200);
    await PortfolioAccount.updateOne({ userId, accountType, mode: 'demo' }, { cashBalance: 12 });

    const response = await request(runtime.app).post(resetPath).set(auth).expect(200);

    assert.equal(response.body.data.account.cashBalanceEUR ?? response.body.data.account.cashBalance, 5000);
    assert.equal((await PortfolioAccount.findOne({ userId, accountType, mode: 'demo' }).lean()).cashBalance, 5000);
  });
}
