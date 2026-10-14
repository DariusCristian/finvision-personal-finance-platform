import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiteralSearchRegex, escapeRegex } from '../../src/utils/regex.js';

test('escapeRegex escapes every regex special character', () => {
  assert.equal(escapeRegex('.*+?^${}()|[]\\'), '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
});

test('escapeRegex leaves plain text unchanged', () => {
  assert.equal(escapeRegex('Groceries 2026'), 'Groceries 2026');
});

test('buildLiteralSearchRegex matches special characters literally and case-insensitively', () => {
  const regex = buildLiteralSearchRegex('c++');

  assert.equal(regex.test('Online C++ course'), true);
  assert.equal(regex.test('ccc'), false);
  assert.equal(regex.flags, 'i');
});

test('buildLiteralSearchRegex accepts unbalanced patterns without throwing', () => {
  assert.doesNotThrow(() => buildLiteralSearchRegex('('));
  assert.equal(buildLiteralSearchRegex('(').test('Coffee (large)'), true);
});

test('buildLiteralSearchRegex neutralizes catastrophic backtracking patterns', () => {
  const regex = buildLiteralSearchRegex('(a+)+$');
  const startedAt = Date.now();

  assert.equal(regex.test(`${'a'.repeat(50_000)}!`), false);
  assert.ok(Date.now() - startedAt < 1000);
});
