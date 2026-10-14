import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import jwt from 'jsonwebtoken';
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

const registerAndGetTokens = async (email = 'refresh@example.com') => {
  const response = await request(runtime.app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Password123', displayName: 'Refresh User' })
    .expect(201);

  return response.body.data;
};

const loginAndGetTokens = async (email = 'refresh@example.com') => {
  const response = await request(runtime.app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password123' })
    .expect(200);

  return response.body.data;
};

const refresh = (refreshToken) =>
  request(runtime.app).post('/api/v1/auth/refresh').send({ refreshToken });

test('refresh rotates the refresh token: the new one works, the old one is rejected', async () => {
  const { refreshToken } = await registerAndGetTokens();

  const rotated = await refresh(refreshToken).expect(200);
  const reused = await refresh(refreshToken);

  assert.ok(rotated.body.data.accessToken);
  assert.notEqual(rotated.body.data.refreshToken, refreshToken);
  assert.equal(reused.status, 401);
  await refresh(rotated.body.data.refreshToken).expect(200);
});

test('refresh after logout is rejected', async () => {
  const { refreshToken } = await registerAndGetTokens();

  await request(runtime.app).post('/api/v1/auth/logout').send({ refreshToken }).expect(200);

  const response = await refresh(refreshToken);
  assert.equal(response.status, 401);
});

test('logout of one device keeps the other device signed in', async () => {
  const laptop = await registerAndGetTokens();
  const phone = await loginAndGetTokens();

  await refresh(phone.refreshToken).expect(200);
  await request(runtime.app)
    .post('/api/v1/auth/logout')
    .send({ refreshToken: phone.refreshToken })
    .expect(200);

  await refresh(laptop.refreshToken).expect(200);
});

test('concurrent refreshes with the same token succeed only once', async () => {
  const { refreshToken } = await registerAndGetTokens();

  const responses = await Promise.all(Array.from({ length: 5 }, () => refresh(refreshToken)));

  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 401).length, 4);
});

test('logout without a valid refresh token still succeeds', async () => {
  await request(runtime.app).post('/api/v1/auth/logout').send({}).expect(200);
  await request(runtime.app)
    .post('/api/v1/auth/logout')
    .send({ refreshToken: 'not-a-jwt' })
    .expect(200);
});

test('a refresh token without a session id (issued before rotation) is rejected', async () => {
  const { user } = await registerAndGetTokens();
  const legacyToken = jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });

  const response = await refresh(legacyToken);
  assert.equal(response.status, 401);
});

test('refresh sessions are not exposed in user payloads', async () => {
  const { accessToken } = await registerAndGetTokens();

  const response = await request(runtime.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(response.body.data.user.refreshSessions, undefined);
});
