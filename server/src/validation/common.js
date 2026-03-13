import { z } from 'zod';

export const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_RE, 'Invalid resource identifier.');

export const currencySchema = z.enum(['RON', 'EUR', 'USD']);
