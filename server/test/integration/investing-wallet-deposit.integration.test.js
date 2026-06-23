import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

before(async () => {
  runtime = await getTestRuntime();
});

beforeEach(async () => {
  await runtime.resetDatabase();
});

after(async () => {
  await releaseTestRuntime();
});

const registerAndLogin = async () => {
  await request(runtime.app)
    .post('/api/v1/auth/register')
    .send({
      email: 'wallet-deposit@example.com',
      password: 'Password123',
      displayName: 'Wallet Deposit',
      baseCurrency: 'RON',
    })
    .expect(201);

  const loginResponse = await request(runtime.app)
    .post('/api/v1/auth/login')
    .send({ email: 'wallet-deposit@example.com', password: 'Password123' })
    .expect(200);

  return loginResponse.body.data.accessToken;
};

test('funding the investing wallet records an Investing expense and reduces the budget balance', async () => {
  const accessToken = await registerAndLogin();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const summaryBefore = await request(runtime.app)
    .get(`/api/v1/budget/summary?year=${year}&month=${month}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(summaryBefore.body.data.expenseTotal, 0);

  const depositResponse = await request(runtime.app)
    .post('/api/v1/investing-wallet/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amountRON: 1000 })
    .expect(200);

  assert.equal(depositResponse.body.data.balance, 1000);

  // The budget must reflect the outflow: a deposit creates an Investing expense.
  const summaryAfter = await request(runtime.app)
    .get(`/api/v1/budget/summary?year=${year}&month=${month}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(summaryAfter.body.data.expenseTotal, 1000);

  // A matching Investing expense transaction should exist.
  const transactionsResponse = await request(runtime.app)
    .get('/api/v1/transactions')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const investingExpense = transactionsResponse.body.data.transactions.find(
    (transaction) =>
      transaction.type === 'expense' &&
      Math.abs(Number(transaction.amount)) === 1000 &&
      transaction.category?.name === 'Investing',
  );

  assert.ok(investingExpense, 'expected an Investing expense transaction for the deposit');
});

test('two deposits accumulate both wallet balance and budget expense', async () => {
  const accessToken = await registerAndLogin();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  await request(runtime.app)
    .post('/api/v1/investing-wallet/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amountRON: 250 })
    .expect(200);

  const secondDeposit = await request(runtime.app)
    .post('/api/v1/investing-wallet/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amountRON: 750 })
    .expect(200);

  assert.equal(secondDeposit.body.data.balance, 1000);

  const summary = await request(runtime.app)
    .get(`/api/v1/budget/summary?year=${year}&month=${month}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(summary.body.data.expenseTotal, 1000);
});
