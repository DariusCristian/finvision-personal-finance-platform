import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.').max(40, 'Category name is too long.'),
  type: z.enum(['income', 'expense']),
  icon: z.string().trim().max(40).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#?[0-9a-f]{6}$/i, 'Use a valid 6-digit hex color.')
    .optional(),
});
