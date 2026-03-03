import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { sendSuccess } from '../../utils/response.js';

const profileRouter = Router();

const budgetGoalSchema = z.object({
  monthlyBudgetGoal: z.coerce
    .number()
    .positive('Monthly budget goal must be greater than zero.')
    .max(1e9 - 1, 'Monthly budget goal is too large.'),
});

const investingGoalSchema = z.object({
  investingMonthlyContributionGoal: z.coerce
    .number()
    .min(0, 'Investing monthly contribution goal cannot be negative.')
    .max(1e9 - 1, 'Investing monthly contribution goal is too large.'),
});

const serializeUser = (user) => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName,
  baseCurrency: user.baseCurrency,
  monthlyBudgetGoal:
    typeof user.monthlyBudgetGoal === 'number' ? user.monthlyBudgetGoal : null,
  investingMonthlyContributionGoal:
    typeof user.investingMonthlyContributionGoal === 'number'
      ? user.investingMonthlyContributionGoal
      : 0,
  investingAccountBalance:
    typeof user.investingAccountBalance === 'number' ? user.investingAccountBalance : 0,
});

profileRouter.patch(
  '/budget-goal',
  requireAuth,
  validateRequest({ body: budgetGoalSchema }),
  async (req, res, next) => {
    try {
      req.authUser.monthlyBudgetGoal = req.body.monthlyBudgetGoal;
      await req.authUser.save();

      sendSuccess(res, {
        user: serializeUser(req.authUser),
      });
    } catch (error) {
      next(error);
    }
  },
);

profileRouter.patch(
  '/investing',
  requireAuth,
  validateRequest({ body: investingGoalSchema }),
  async (req, res, next) => {
    try {
      req.authUser.investingMonthlyContributionGoal = req.body.investingMonthlyContributionGoal;
      await req.authUser.save();

      sendSuccess(res, {
        user: serializeUser(req.authUser),
      });
    } catch (error) {
      next(error);
    }
  },
);

export { profileRouter };
