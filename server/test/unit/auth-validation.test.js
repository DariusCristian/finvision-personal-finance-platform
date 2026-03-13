import assert from 'node:assert/strict';
import test from 'node:test';

import { loginSchema, registerSchema } from '../../src/validation/auth.js';

test('register schema normalizes email and validates password policy', () => {
  const parsed = registerSchema.parse({
    email: '  User@Test.com ',
    password: 'Password123',
    displayName: 'Alex',
    baseCurrency: 'EUR',
  });

  assert.equal(parsed.email, 'user@test.com');
  assert.equal(parsed.baseCurrency, 'EUR');

  assert.throws(
    () =>
      registerSchema.parse({
        email: 'user@test.com',
        password: 'short',
        displayName: 'Alex',
      }),
    /Password must be at least 8 characters/,
  );
});

test('login schema rejects invalid email format', () => {
  assert.throws(
    () => loginSchema.parse({ email: 'invalid-email', password: 'Password123' }),
    /Enter a valid email address/,
  );
});
