import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { Category } from '../../src/models/category.js';
import { Transaction } from '../../src/models/transaction.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const registerAndGetToken = async () => {
  const response = await request(runtime.app)
    .post('/api/v1/auth/register')
    .send({
      email: 'insights-test@example.com',
      password: 'Password123',
      displayName: 'Insights Test User',
      baseCurrency: 'EUR',
    })
    .expect(201);

  return {
    userId: response.body.data.user.id,
    accessToken: response.body.data.accessToken,
  };
};

const seedRecurringWithoutEnd = async (userId) => {
  const expenseCategory = await Category.findOne({ type: 'expense', userId: null }).select('_id');

  assert.ok(expenseCategory?._id);

  await Transaction.create({
    userId,
    categoryId: expenseCategory._id,
    type: 'expense',
    amount: 15.99,
    currency: 'USD',
    date: new Date(),
    description: 'Netflix',
    isRecurring: true,
    recurrence: 'monthly',
    recurrenceEndDate: null,
  });
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

test('GET /api/v1/insights returns active generated insights and dismiss endpoint hides them', async () => {
  const { userId, accessToken } = await registerAndGetToken();
  await seedRecurringWithoutEnd(userId);

  const listResponse = await request(runtime.app)
    .get('/api/v1/insights?limit=10')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(listResponse.body.success, true);
  assert.ok(Array.isArray(listResponse.body.data.insights));
  assert.ok(listResponse.body.data.insights.length > 0);
  assert.ok(
    listResponse.body.data.insights.some((insight) => insight.type === 'SUBSCRIPTION_NO_END'),
  );

  for (const insight of listResponse.body.data.insights) {
    const dismissResponse = await request(runtime.app)
      .post(`/api/v1/insights/${insight.id}/dismiss`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    assert.equal(dismissResponse.body.success, true);
    assert.equal(dismissResponse.body.data.insight.status, 'dismissed');
  }

  const listAfterDismiss = await request(runtime.app)
    .get('/api/v1/insights?limit=10')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(listAfterDismiss.body.data.insights.length, 0);
});
