import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { PortfolioAccount } from '../../src/models/portfolio-account.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const registerAndLogin = async () => {
  const registerResponse = await request(runtime.app).post('/api/v1/auth/register').send({
    email: 'invest-state@example.com',
    password: 'Password123',
    displayName: 'Invest State User',
    baseCurrency: 'EUR',
  });

  return registerResponse.body.data.accessToken;
};

before(async () => {
  runtime = await getTestRuntime();
});

beforeEach(async () => {
  await runtime.resetDatabase();
});

after(async () => {
  await releaseTestRuntime();
});

test('crypto state initializes funded at 0 EUR and demo at 5000 EUR', async () => {
  const accessToken = await registerAndLogin();

  const stateResponse = await request(runtime.app)
    .get('/api/v1/invest/crypto/state')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(stateResponse.body.data.accounts.funded.cashBalanceEUR, 0);
  assert.equal(stateResponse.body.data.accounts.demo.cashBalanceEUR, 5000);

  const accountDocuments = await PortfolioAccount.find({ accountType: 'crypto' }).lean();
  const fundedAccount = accountDocuments.find((account) => account.mode === 'funded');
  const demoAccount = accountDocuments.find((account) => account.mode === 'demo');

  assert.ok(fundedAccount);
  assert.ok(demoAccount);
  assert.equal(fundedAccount.cashBalance, 0);
  assert.equal(demoAccount.cashBalance, 5000);
});

test('funded mode holdings totals stay at 0 before top-up or trades', async () => {
  const accessToken = await registerAndLogin();

  await request(runtime.app)
    .post('/api/v1/invest/crypto/mode')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ mode: 'funded' })
    .expect(200);

  const holdingsResponse = await request(runtime.app)
    .get('/api/v1/invest/holdings')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(holdingsResponse.body.data.selectedMode, 'funded');
  assert.equal(holdingsResponse.body.data.totals.cashBalanceEUR, 0);
  assert.equal(holdingsResponse.body.data.totals.holdingsValueEUR, 0);
  assert.equal(holdingsResponse.body.data.totals.totalValueEUR, 0);
  assert.deepEqual(holdingsResponse.body.data.holdings, []);
});

test('account endpoint is mode-scoped and does not inherit demo balance in funded mode', async () => {
  const accessToken = await registerAndLogin();

  await request(runtime.app)
    .post('/api/v1/invest/crypto/mode')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ mode: 'demo' })
    .expect(200);

  const demoAccountResponse = await request(runtime.app)
    .get('/api/v1/invest/account')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(demoAccountResponse.body.data.selectedMode, 'demo');
  assert.equal(demoAccountResponse.body.data.account.mode, 'demo');
  assert.equal(demoAccountResponse.body.data.totals.cashBalanceEUR, 5000);
  assert.equal(demoAccountResponse.body.data.totals.totalValueEUR, 5000);

  await request(runtime.app)
    .post('/api/v1/invest/crypto/mode')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ mode: 'funded' })
    .expect(200);

  const fundedAccountResponse = await request(runtime.app)
    .get('/api/v1/invest/account')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(fundedAccountResponse.body.data.selectedMode, 'funded');
  assert.equal(fundedAccountResponse.body.data.account.mode, 'funded');
  assert.equal(fundedAccountResponse.body.data.totals.cashBalanceEUR, 0);
  assert.equal(fundedAccountResponse.body.data.totals.holdingsValueEUR, 0);
  assert.equal(fundedAccountResponse.body.data.totals.totalValueEUR, 0);
  assert.equal(fundedAccountResponse.body.data.holdingsCount, 0);
});
