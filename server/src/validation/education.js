import { z } from 'zod';

import { ARTICLE_DIFFICULTY_VALUES } from '../models/article.js';
import { QUIZ_DIFFICULTY_VALUES } from '../models/quiz.js';
import { objectIdSchema } from './common.js';

const idOrSlugSchema = z.string().trim().min(1);

const categorySchema = z.string().trim().min(1).max(40);

export const articleListQuerySchema = z.object({
  category: categorySchema.optional(),
  difficulty: z.enum(ARTICLE_DIFFICULTY_VALUES).optional(),
  search: z.string().trim().max(120).optional(),
});

export const articleIdentifierParamsSchema = z.object({
  idOrSlug: idOrSlugSchema,
});

export const articleCompleteParamsSchema = z.object({
  id: objectIdSchema,
});

export const quizListQuerySchema = z.object({
  category: categorySchema.optional(),
  difficulty: z.enum(QUIZ_DIFFICULTY_VALUES).optional(),
});

export const quizIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const quizAttemptBodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: objectIdSchema,
        selectedOptionId: z.string().trim().min(1, 'selectedOptionId is required.'),
      }),
    )
    .default([]),
  timeSpentSeconds: z.coerce.number().int().nonnegative().max(86_400).optional(),
});
