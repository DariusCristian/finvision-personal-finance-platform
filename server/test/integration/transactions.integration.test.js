import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const registerAndLogin = async () => {
  const registerResponse = await request(runtime.app).post('/api/v1/auth/register').send({
    email: 'transactions@example.com',
    password: 'Password123',
    displayName: 'Transactions User',
    baseCurrency: 'USD',
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

test('create transaction and list sorted by amount desc', async () => {
  const accessToken = await registerAndLogin();

  const categoriesResponse = await request(runtime.app)
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const foodCategory = categoriesResponse.body.data.categories.find(
    (category) => category.name === 'Food & Dining',
  );

  assert.ok(foodCategory);

  await request(runtime.app)
    .post('/api/v1/transactions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'expense',
      categoryId: foodCategory.id,
      amount: 15,
      date: '2026-03-01',
      description: 'Lunch',
      isRecurring: false,
      recurrence: 'none',
      recurrenceEndDate: null,
    })
    .expect(201);

  await request(runtime.app)
    .post('/api/v1/transactions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'expense',
      categoryId: foodCategory.id,
      amount: 120,
      date: '2026-03-02',
      description: 'Groceries',
      isRecurring: false,
      recurrence: 'none',
      recurrenceEndDate: null,
    })
    .expect(201);

  const response = await request(runtime.app)
    .get('/api/v1/transactions?from=2026-03-01&to=2026-03-31&sort=-amount')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const [first] = response.body.data.transactions;
  assert.equal(first.amount, 120);
});

test('recurring transaction is projected in future month query', async () => {
  const accessToken = await registerAndLogin();

  const categoriesResponse = await request(runtime.app)
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const entertainmentCategory = categoriesResponse.body.data.categories.find(
    (category) => category.name === 'Entertainment',
  );

  assert.ok(entertainmentCategory);

  await request(runtime.app)
    .post('/api/v1/transactions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'expense',
      categoryId: entertainmentCategory.id,
      amount: 19.99,
      date: '2026-03-05',
      description: 'Streaming Plan',
      isRecurring: true,
      recurrence: 'monthly',
      recurrenceEndDate: '2026-06-05',
    })
    .expect(201);

  const response = await request(runtime.app)
    .get('/api/v1/transactions?from=2026-04-01&to=2026-04-30&sort=-date')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.ok(response.body.data.transactions.length > 0);
  assert.equal(response.body.data.transactions[0].isProjected, true);
});
