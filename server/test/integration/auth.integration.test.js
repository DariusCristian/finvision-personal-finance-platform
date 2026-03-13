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

test('register returns user payload with access token and requestId', async () => {
  const response = await request(runtime.app)
    .post('/api/v1/auth/register')
    .set('x-request-id', 'test-register-request')
    .send({
      email: 'student@example.com',
      password: 'Password123',
      displayName: 'Student User',
      baseCurrency: 'RON',
    })
    .expect(201);

  assert.equal(response.body.success, true);
  assert.equal(response.body.requestId, 'test-register-request');
  assert.equal(response.body.data.user.email, 'student@example.com');
  assert.ok(response.body.data.accessToken);
});

test('login and me work with bearer token', async () => {
  await request(runtime.app).post('/api/v1/auth/register').send({
    email: 'alex@example.com',
    password: 'Password123',
    displayName: 'Alex User',
    baseCurrency: 'EUR',
  });

  const loginResponse = await request(runtime.app).post('/api/v1/auth/login').send({
    email: 'alex@example.com',
    password: 'Password123',
  });

  const accessToken = loginResponse.body.data.accessToken;
  assert.ok(accessToken);

  const meResponse = await request(runtime.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(meResponse.body.data.user.email, 'alex@example.com');
  assert.equal(meResponse.body.data.user.baseCurrency, 'EUR');
});
