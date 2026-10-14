import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { Article } from '../../src/models/article.js';
import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

let runtime;

const createArticles = async (titles) => {
  for (const title of titles) {
    await Article.create({ title, excerpt: '', contentBlocks: [] });
  }
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

test('article search with an unbalanced parenthesis returns 200', async () => {
  await createArticles(['Budgeting (the basics)', 'Saving tips']);

  const response = await request(runtime.app).get('/api/v1/education/articles?search=%28').expect(200);

  assert.deepEqual(
    response.body.data.articles.map((article) => article.title),
    ['Budgeting (the basics)'],
  );
});

test('article search matches special characters literally', async () => {
  await createArticles(['Learn C++ for finance', 'ccc explained']);

  const response = await request(runtime.app)
    .get(`/api/v1/education/articles?search=${encodeURIComponent('c++')}`)
    .expect(200);

  assert.deepEqual(
    response.body.data.articles.map((article) => article.title),
    ['Learn C++ for finance'],
  );
});

test('article search with a catastrophic regex pattern returns quickly', async () => {
  await createArticles([`${'a'.repeat(5000)}!`, 'Regex (a+)+$ explained']);

  const startedAt = Date.now();
  const response = await request(runtime.app)
    .get(`/api/v1/education/articles?search=${encodeURIComponent('(a+)+$')}`)
    .expect(200);

  assert.deepEqual(
    response.body.data.articles.map((article) => article.title),
    ['Regex (a+)+$ explained'],
  );
  assert.ok(Date.now() - startedAt < 2000);
});

test('article search longer than 100 characters returns 400', async () => {
  const response = await request(runtime.app)
    .get(`/api/v1/education/articles?search=${'a'.repeat(101)}`)
    .expect(400);

  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});
