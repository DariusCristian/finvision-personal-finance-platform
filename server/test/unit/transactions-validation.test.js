import assert from 'node:assert/strict';
import test from 'node:test';

import { transactionMutationSchema } from '../../src/validation/transactions.js';

const BASE_PAYLOAD = {
  type: 'expense',
  categoryId: '507f1f77bcf86cd799439011',
  amount: 120,
  date: '2026-03-06',
  description: 'Utilities',
};

test('recurring transaction requires recurrenceEndDate', () => {
  assert.throws(
    () =>
      transactionMutationSchema.parse({
        ...BASE_PAYLOAD,
        isRecurring: true,
        recurrence: 'monthly',
        recurrenceEndDate: null,
      }),
    /Recurring transactions require an end date/,
  );
});

test('one-time transaction requires recurrence none and no end date', () => {
  assert.throws(() =>
    transactionMutationSchema.parse({
      ...BASE_PAYLOAD,
      isRecurring: false,
      recurrence: 'monthly',
      recurrenceEndDate: null,
    }),
  );

  const parsed = transactionMutationSchema.parse({
    ...BASE_PAYLOAD,
    isRecurring: false,
    recurrence: 'none',
    recurrenceEndDate: null,
  });

  assert.equal(parsed.recurrence, 'none');
  assert.equal(parsed.isRecurring, false);
});
