import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import request from 'supertest';

import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

// Env is read once per process, so this file enables small limits before the runtime starts.
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.LOGIN_RATE_LIMIT_MAX = '3';
process.env.FINNY_CHAT_RATE_LIMIT_MAX = '2';

let runtime;

before(async () => {
  runtime = await getTestRuntime();
});

after(async () => {
  await releaseTestRuntime();
});

const register = (email) =>
  request(runtime.app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Password123', displayName: 'Limited User' })
    .expect(201);

const login = (email, password) => request(runtime.app).post('/api/v1/auth/login').send({ email, password });

// All requests come from 127.0.0.1 and the limiter's memory store lives for the whole file, so order matters:
// successful logins first (they must not count), then the failed-login burst.
test('successful logins do not count towards the login limit', async () => {
  await register('success@example.com');

  const statuses = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    statuses.push((await login('success@example.com', 'Password123')).status);
  }

  assert.deepEqual(statuses, [200, 200, 200, 200, 200]);
});

test('a burst of wrong logins is rate limited with 429', async () => {
  await register('burst@example.com');

  const statuses = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    statuses.push((await login('burst@example.com', 'WrongPassword1')).status);
  }

  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);

  const limited = await login('burst@example.com', 'Password123');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.ok(limited.headers.ratelimit);
});

test('Finny chat is limited per user', async () => {
  const { body } = await register('finny-limit@example.com');
  const auth = { Authorization: `Bearer ${body.data.accessToken}` };
  // An off-topic question is refused deterministically, without calling Gemini.
  const ask = () =>
    request(runtime.app)
      .post('/api/v1/finny/chat')
      .set(auth)
      .send({ message: 'Who won the football game last night?', contextType: 'general' });

  const statuses = [(await ask()).status, (await ask()).status, (await ask()).status];

  assert.deepEqual(statuses, [200, 200, 429]);
});
