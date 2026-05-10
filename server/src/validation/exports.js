import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const budgetExportQuerySchema = z.object({
  from: z.string().trim().regex(DATE_RE, 'from must be in YYYY-MM-DD format.'),
  to: z.string().trim().regex(DATE_RE, 'to must be in YYYY-MM-DD format.'),
});

export const investExportQuerySchema = z
  .object({
    range: z.enum(['all', 'month']).optional().default('month'),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .superRefine((value, context) => {
    if (value.range !== 'month') {
      return;
    }

    if (value.year !== undefined && value.month === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['month'],
        message: 'month is required when year is provided.',
      });
    }

    if (value.month !== undefined && value.year === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['year'],
        message: 'year is required when month is provided.',
      });
    }
  });

