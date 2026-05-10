import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { buildInsightContext } from '../../modules/insights/buildInsightContext.js';
import { generateInsights } from '../../modules/insights/generateInsights.js';
import { Insight } from '../../models/insight.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { serializeInsight } from '../../utils/insights.js';
import { sendSuccess } from '../../utils/response.js';

const insightsRouter = Router();

const insightsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  selectedMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

const dismissInsightParamsSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

insightsRouter.get(
  '/',
  requireAuth,
  validateRequest({ query: insightsQuerySchema }),
  async (req, res, next) => {
    try {
      const context = await buildInsightContext({
        authUser: req.authUser,
        selectedMonth: req.query.selectedMonth,
      });

      const insights = await generateInsights({
        userId: req.authUser._id,
        context,
        limit: req.query.limit,
      });

      sendSuccess(res, {
        insights: insights.map((insight) => serializeInsight(insight)),
      });
    } catch (error) {
      next(error);
    }
  },
);

insightsRouter.post(
  '/:id/dismiss',
  requireAuth,
  validateRequest({ params: dismissInsightParamsSchema }),
  async (req, res, next) => {
    try {
      const insight = await Insight.findOneAndUpdate(
        {
          _id: req.params.id,
          userId: req.authUser._id,
        },
        {
          $set: {
            status: 'dismissed',
          },
        },
        { new: true },
      );

      if (!insight) {
        throw new AppError({
          message: 'Insight not found.',
          statusCode: 404,
          code: 'INSIGHT_NOT_FOUND',
        });
      }

      sendSuccess(res, {
        insight: serializeInsight(insight),
      });
    } catch (error) {
      next(error);
    }
  },
);

export { insightsRouter };
