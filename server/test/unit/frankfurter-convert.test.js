import assert from 'node:assert/strict';
import test from 'node:test';

import { convert } from '../../src/integrations/fx/frankfurterClient.js';

const originalFetch = global.fetch;

const jsonResponse = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });

test.after(() => {
  global.fetch = originalFetch;
});

test('convert returns realistic EUR amount for 1100 RON', async () => {
  global.fetch = async () =>
    jsonResponse({
      amount: 1100,
      base: 'RON',
      date: '2026-03-25',
      rates: {
        EUR: 215.88,
      },
    });

  const result = await convert({
    from: 'RON',
    to: 'EUR',
    amount: 1100,
  });

  assert.equal(result.convertedAmount, 215.88);
  assert.ok(result.convertedAmount > 100 && result.convertedAmount < 400);
});

test('convert exposes non-inverted bidirectional rates', async () => {
  global.fetch = async () =>
    jsonResponse({
      amount: 550,
      base: 'RON',
      date: '2026-03-25',
      rates: {
        EUR: 107.94,
      },
    });

  const result = await convert({
    from: 'RON',
    to: 'EUR',
    amount: 550,
  });

  assert.equal(result.rate, result.rateToPerFrom);
  assert.equal(result.rateToPerFrom, result.convertedAmount / 550);
  assert.equal(result.rateFromPerTo, 550 / result.convertedAmount);
  assert.ok(
    typeof result.rateFromPerTo === 'number' &&
      Math.abs(result.rateToPerFrom * result.rateFromPerTo - 1) < 1e-10,
  );
});
