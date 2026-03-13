import { z } from 'zod';

import { PAYMENT_METHOD_VALUES, RECURRENCE_VALUES } from '../models/transaction.js';
import { currencySchema, objectIdSchema } from './common.js';

export const transactionSortSchema = z.enum(['date', '-date', 'amount', '-amount']);

export const transactionParamsSchema = z.object({
  transactionId: objectIdSchema,
});

export const transactionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  categoryId: objectIdSchema.optional(),
  type: z.enum(['income', 'expense']).optional(),
  sort: transactionSortSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const transactionMutationSchema = z
  .object({
    type: z.enum(['income', 'expense']),
    categoryId: objectIdSchema,
    amount: z.coerce.number().positive('Amount must be greater than zero.'),
    currency: currencySchema.optional(),
    date: z.coerce.date(),
    description: z.string().trim().max(160).optional().default(''),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).nullable().optional().default(null),
    isRecurring: z.boolean().optional().default(false),
    recurrence: z.enum(RECURRENCE_VALUES).optional().default('none'),
    recurrenceEndDate: z.coerce.date().nullable().optional().default(null),
  })
  .superRefine((value, context) => {
    if (value.isRecurring && value.recurrence === 'none') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrence'],
        message: 'Select a recurrence pattern for recurring transactions.',
      });
    }

    if (!value.isRecurring && value.recurrence !== 'none') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrence'],
        message: 'One-time transactions must use recurrence "none".',
      });
    }

    if (value.isRecurring && !value.recurrenceEndDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrenceEndDate'],
        message: 'Recurring transactions require an end date.',
      });
    }

    if (
      value.isRecurring &&
      value.recurrenceEndDate &&
      value.recurrenceEndDate.getTime() < value.date.getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrenceEndDate'],
        message: 'Recurring end date must be on or after the start date.',
      });
    }

    if (!value.isRecurring && value.recurrenceEndDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrenceEndDate'],
        message: 'One-time transactions cannot have a recurring end date.',
      });
    }
  });
