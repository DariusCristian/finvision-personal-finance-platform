import { z } from 'zod';

const NEWS_TOPICS = ['budgeting', 'investing', 'crypto', 'macro', 'all'];

export const newsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  topic: z.enum(NEWS_TOPICS).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
