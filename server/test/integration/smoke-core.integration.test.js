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

test('smoke: auth + categories + transactions + finny chat flow', async () => {
  await request(runtime.app)
    .post('/api/v1/auth/register')
    .send({
      email: 'smoke-user@example.com',
      password: 'Password123',
      displayName: 'Smoke User',
      baseCurrency: 'EUR',
    })
    .expect(201);

  const loginResponse = await request(runtime.app)
    .post('/api/v1/auth/login')
    .send({
      email: 'smoke-user@example.com',
      password: 'Password123',
    })
    .expect(200);

  const accessToken = loginResponse.body?.data?.accessToken;
  assert.ok(typeof accessToken === 'string' && accessToken.length > 0);

  await request(runtime.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const categoriesResponse = await request(runtime.app)
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const expenseCategory = categoriesResponse.body?.data?.categories?.find((category) => category.type === 'expense');
  assert.ok(expenseCategory?.id);

  await request(runtime.app)
    .post('/api/v1/transactions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'expense',
      categoryId: expenseCategory.id,
      amount: 45,
      date: new Date().toISOString(),
      description: 'Smoke transaction',
      isRecurring: false,
      recurrence: 'none',
      recurrenceEndDate: null,
    })
    .expect(201);

  const finnyResponse = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'Check my budget for this month.',
      contextType: 'budget',
    })
    .expect(200);

  assert.equal(finnyResponse.body?.success, true);
});
