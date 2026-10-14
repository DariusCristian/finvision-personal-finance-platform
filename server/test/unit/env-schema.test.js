import assert from 'node:assert/strict';
import test from 'node:test';

import { parseEnv } from '../../src/config/env-schema.js';

const validSecret = (label) => `${label}-0123456789abcdefghijklmnopqrstuvwxyz`;

const baseEnv = (overrides = {}) => ({
  MONGODB_URI: 'mongodb://localhost:27017/finvision?replicaSet=rs0',
  JWT_ACCESS_SECRET: validSecret('access'),
  JWT_REFRESH_SECRET: validSecret('refresh'),
  ...overrides,
});

test('parseEnv accepts JWT secrets of at least 32 characters', () => {
  const env = parseEnv(baseEnv());

  assert.equal(env.JWT_ACCESS_SECRET, validSecret('access'));
});

test('parseEnv rejects JWT secrets shorter than 32 characters and explains how to generate one', () => {
  assert.throws(
    () => parseEnv(baseEnv({ JWT_ACCESS_SECRET: 'x'.repeat(31) })),
    /JWT_ACCESS_SECRET: JWT_ACCESS_SECRET must be at least 32 characters.*openssl rand -base64 48/,
  );
  assert.throws(() => parseEnv(baseEnv({ JWT_REFRESH_SECRET: 'change_me' })), /JWT_REFRESH_SECRET/);
});

test('parseEnv rejects a missing JWT secret', () => {
  const { JWT_REFRESH_SECRET: _omitted, ...withoutRefresh } = baseEnv();

  assert.throws(() => parseEnv(withoutRefresh), /JWT_REFRESH_SECRET is required/);
});

test('parseEnv rejects long placeholder secrets in production only', () => {
  const placeholder = 'change_me_change_me_change_me_change_me';

  assert.doesNotThrow(() =>
    parseEnv(baseEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: placeholder })),
  );
  assert.throws(
    () => parseEnv(baseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: placeholder })),
    /JWT_ACCESS_SECRET looks like a placeholder/,
  );
  assert.doesNotThrow(() => parseEnv(baseEnv({ NODE_ENV: 'production' })));
});
