import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const registerAndGetToken = async () => {
  const response = await request(runtime.app)
    .post('/api/v1/auth/register')
    .send({
      email: 'finny-topic-lock@example.com',
      password: 'Password123',
      displayName: 'Finny Topic Lock',
      baseCurrency: 'EUR',
    })
    .expect(201);

  return response.body.data.accessToken;
};

const createExpense = async ({ accessToken, categoryId, amount, date, description }) => {
  await request(runtime.app)
    .post('/api/v1/transactions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      type: 'expense',
      categoryId,
      amount,
      date,
      description,
      isRecurring: false,
      recurrence: 'none',
      recurrenceEndDate: null,
    })
    .expect(201);
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

test('out-of-scope chat message returns refusal without provider dependency', async () => {
  const accessToken = await registerAndGetToken();

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'Who is the striker at FC Barcelona?',
      contextType: 'general',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'text');
  assert.ok(typeof response.body.data.text === 'string');
  assert.ok(response.body.data.text.includes("I can't help with that topic"));
  assert.equal(response.body.data.content, response.body.data.text);
});

test('saving tips request is in scope and returns structured card', async () => {
  const accessToken = await registerAndGetToken();

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'Give me saving tips based on my current budget and spending.',
      contextType: 'budget',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'card');
  assert.equal(response.body.data.card?.title, 'Saving Tips');
});

test('net worth request is in scope and returns structured card', async () => {
  const accessToken = await registerAndGetToken();

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'Explain net worth and show how my net worth is calculated in FinVision.',
      contextType: 'general',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'card');
  assert.equal(response.body.data.card?.title, 'Net Worth Snapshot');
});

test('track expenses and budget check return budget overview card instead of subscription-only alert', async () => {
  const accessToken = await registerAndGetToken();

  const categoriesResponse = await request(runtime.app)
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const expenseCategory = categoriesResponse.body.data.categories.find((item) => item.type === 'expense');
  assert.ok(expenseCategory?.id);

  await createExpense({
    accessToken,
    categoryId: expenseCategory.id,
    amount: 120,
    date: new Date().toISOString(),
    description: 'Groceries',
  });

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'Check my budget for this month and track expenses.',
      contextType: 'budget',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'card');
  assert.equal(response.body.data.card?.title, 'Budget Overview');
});

test('top spending categories intent returns structured categories card', async () => {
  const accessToken = await registerAndGetToken();

  const categoriesResponse = await request(runtime.app)
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const expenseCategories = categoriesResponse.body.data.categories.filter((item) => item.type === 'expense');
  assert.ok(expenseCategories.length >= 3);

  await createExpense({
    accessToken,
    categoryId: expenseCategories[0].id,
    amount: 300,
    date: new Date().toISOString(),
    description: 'Housing bill',
  });
  await createExpense({
    accessToken,
    categoryId: expenseCategories[1].id,
    amount: 180,
    date: new Date().toISOString(),
    description: 'Transport card',
  });
  await createExpense({
    accessToken,
    categoryId: expenseCategories[2].id,
    amount: 120,
    date: new Date().toISOString(),
    description: 'Food delivery',
  });

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: 'What are my top 3 spending categories this month?',
      contextType: 'budget',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'card');
  assert.equal(response.body.data.card?.title, 'Top Spending Categories');
});

test('habit improvement 30d intent returns one-habit card grounded in recent data', async () => {
  const accessToken = await registerAndGetToken();

  const categoriesResponse = await request(runtime.app)
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const expenseCategory = categoriesResponse.body.data.categories.find((item) => item.type === 'expense');
  assert.ok(expenseCategory?.id);

  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

  await createExpense({
    accessToken,
    categoryId: expenseCategory.id,
    amount: 260,
    date: tenDaysAgo.toISOString(),
    description: 'Recent category spend',
  });

  await createExpense({
    accessToken,
    categoryId: expenseCategory.id,
    amount: 120,
    date: fortyDaysAgo.toISOString(),
    description: 'Previous month category spend',
  });

  const response = await request(runtime.app)
    .post('/api/v1/finny/chat')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      message: "What's one habit I can improve based on my last 30 days?",
      contextType: 'budget',
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.format, 'card');
  assert.equal(response.body.data.card?.title, 'One Habit to Improve');
});
