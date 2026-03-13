import assert from 'node:assert/strict';
import test from 'node:test';

import { mapZodIssues } from '../../src/utils/validation.js';

test('mapZodIssues serializes zod issue details', () => {
  const details = mapZodIssues([
    {
      path: ['body', 'email'],
      code: 'invalid_string',
      message: 'Invalid email',
    },
  ]);

  assert.deepEqual(details, [
    {
      path: 'body.email',
      code: 'invalid_string',
      message: 'Invalid email',
    },
  ]);
});
