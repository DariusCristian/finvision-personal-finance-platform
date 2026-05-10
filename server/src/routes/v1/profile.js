import bcrypt from 'bcryptjs';
import { Router } from 'express';

import { AuthError, ConflictError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { User } from '../../models/user.js';
import { sendSuccess } from '../../utils/response.js';
import { serializeUser } from '../../utils/serializers.js';
import {
  budgetGoalSchema,
  investingGoalSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from '../../validation/profile.js';

const profileRouter = Router();
const SALT_ROUNDS = 12;

profileRouter.get('/', requireAuth, (req, res) => {
  sendSuccess(res, {
    user: serializeUser(req.authUser),
  });
});

profileRouter.patch(
  '/',
  requireAuth,
  validateRequest({ body: updateProfileSchema }),
  async (req, res, next) => {
    try {
      const { displayName, email, baseCurrency, locale, investCryptoMode, marketStocksMode } = req.body;

      if (email !== undefined) {
        const existingUser = await User.findOne({
          email,
          _id: { $ne: req.authUser._id },
        }).select('_id');

        if (existingUser) {
          throw new ConflictError('An account with this email already exists.', [], 'CONFLICT');
        }

        req.authUser.email = email;
      }

      if (displayName !== undefined) {
        req.authUser.displayName = displayName;
      }

      if (baseCurrency !== undefined) {
        req.authUser.baseCurrency = baseCurrency;
      }

      if (locale !== undefined) {
        req.authUser.locale = locale;
      }

      if (investCryptoMode !== undefined) {
        req.authUser.investCryptoMode = investCryptoMode;
      }

      if (marketStocksMode !== undefined) {
        req.authUser.marketStocksMode = marketStocksMode;
      }

      await req.authUser.save();

      sendSuccess(res, {
        user: serializeUser(req.authUser),
      });
    } catch (error) {
      if (error?.code === 11000) {
        next(new ConflictError('An account with this email already exists.', [], 'CONFLICT'));
        return;
      }

      next(error);
    }
  },
);

profileRouter.patch(
  '/password',
  requireAuth,
  validateRequest({ body: updatePasswordSchema }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        req.authUser.passwordHash,
      );

      if (!isCurrentPasswordValid) {
        throw new AuthError('Current password is incorrect.');
      }

      req.authUser.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await req.authUser.save();

      sendSuccess(res, {
        changed: true,
      });
    } catch (error) {
      next(error);
    }
  },
);

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
