import { z } from 'zod';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const budgetGoalSchema = z.object({
  monthlyBudgetGoal: z.coerce
    .number()
    .positive('Monthly budget goal must be greater than zero.')
    .max(1e9 - 1, 'Monthly budget goal is too large.'),
});

export const investingGoalSchema = z.object({
  investingMonthlyContributionGoal: z.coerce
    .number()
    .min(0, 'Investing monthly contribution goal cannot be negative.')
    .max(1e9 - 1, 'Investing monthly contribution goal is too large.'),
});

const avatarUrlSchema = z
  .string()
  .trim()
  .max(2048, 'Avatar URL is too long.')
  .optional()
  .refine((value) => {
    if (value === undefined || value.length === 0) {
      return true;
    }

    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, 'Avatar URL must be a valid URL.');

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Display name must contain at least 2 characters.')
      .max(50, 'Display name cannot exceed 50 characters.')
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address.')
      .optional(),
    avatarUrl: avatarUrlSchema,
    baseCurrency: z.enum(['RON', 'EUR', 'USD']).optional(),
    locale: z.enum(['en-US', 'ro-RO']).optional(),
    investCryptoMode: z.enum(['funded', 'demo']).nullable().optional(),
    marketStocksMode: z.enum(['funded', 'demo']).nullable().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one profile field must be provided.',
    path: ['displayName'],
  });

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z
      .string()
      .regex(
        PASSWORD_RE,
        'New password must have at least 8 characters, including uppercase, lowercase, and a number.',
      ),
  })
  .refine((payload) => payload.currentPassword !== payload.newPassword, {
    message: 'New password must be different from current password.',
    path: ['newPassword'],
  });
