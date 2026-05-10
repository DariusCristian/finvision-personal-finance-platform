import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyIntent, inspectTopicScope, isInScope } from '../../src/modules/finny/topicGuard.js';

test('topic guard blocks out-of-scope sports question', () => {
  const message = 'Who is the striker at FC Barcelona?';
  const scope = inspectTopicScope(message);

  assert.equal(isInScope(message), false);
  assert.equal(scope.inScope, false);
  assert.ok(scope.matchedKeywords.includes('striker'));
});

test('topic guard allows ETF concept question', () => {
  const message = 'What is an ETF?';
  const scope = inspectTopicScope(message);

  assert.equal(isInScope(message), true);
  assert.equal(scope.inScope, true);
  assert.ok(scope.matchedKeywords.includes('etf'));
});

test('topic guard allows BTC vs ETH comparison', () => {
  const message = 'Compare BTC to ETH';

  assert.equal(isInScope(message), true);
});

test('topic guard allows subscription check question', () => {
  const message = 'Check my subscriptions';

  assert.equal(isInScope(message), true);
});

test('topic guard allows saving tips topic and classifies saving intent', () => {
  const message = 'Give me saving tips based on my budget.';

  assert.equal(isInScope(message), true);
  assert.equal(classifyIntent(message), 'SAVING_TIPS');
});

test('topic guard allows net worth topic and classifies net worth intent', () => {
  const message = 'Explain net worth and my assets.';

  assert.equal(isInScope(message), true);
  assert.equal(classifyIntent(message), 'NET_WORTH');
});

test('topic guard classifies top spending categories intent', () => {
  const message = 'What are my top 3 spending categories this month?';

  assert.equal(isInScope(message), true);
  assert.equal(classifyIntent(message), 'TOP_SPENDING_CATEGORIES');
});

test('topic guard classifies habit improvement last 30 days intent', () => {
  const message = "What's one habit I can improve based on my last 30 days?";

  assert.equal(isInScope(message), true);
  assert.equal(classifyIntent(message), 'HABIT_IMPROVEMENT_30D');
});
