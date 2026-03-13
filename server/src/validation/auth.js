import { z } from 'zod';

import { currencySchema } from './common.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address.'),
  password: z
    .string()
    .regex(
      PWD_RE,
      'Password must be at least 8 characters with uppercase, lowercase, and a number.',
    ),
  displayName: z.string().trim().min(1, 'Display name is required.'),
  baseCurrency: currencySchema.default('RON'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
