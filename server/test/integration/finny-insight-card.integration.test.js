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
      email: 'finny-insight-card@example.com',
      password: 'Password123',
      displayName: 'Finny Insight Card User',
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

test('Finny returns insight_card for subscription analysis prompts when insight is available', async () => {
  const { userId, accessToken } = await registerAndGetToken();
  await seedRecurringWithoutEnd(userId);

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'Check my subscriptions',
      contextType: 'subscriptions',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'insight_card');
  assert.equal(response.body.data.card.icon, 'subscription');
  assert.ok(Array.isArray(response.body.data.card.blocks));
  assert.ok(response.body.data.card.blocks.length >= 3);
});
