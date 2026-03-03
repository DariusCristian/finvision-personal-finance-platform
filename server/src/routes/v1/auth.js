import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { AppError, AuthError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { User } from '../../models/user.js';
import { createAccessToken } from '../../utils/jwt.js';
import { sendSuccess } from '../../utils/response.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const SALT_ROUNDS = 12;

const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address.'),
  password: z
    .string()
    .regex(
      PWD_RE,
      'Password must be at least 8 characters with uppercase, lowercase, and a number.',
    ),
  displayName: z.string().trim().min(1, 'Display name is required.'),
  baseCurrency: z.enum(['RON', 'EUR', 'USD']).default('RON'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
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

const toAuthPayload = (user) => ({
  user: serializeUser(user),
  accessToken: createAccessToken(user._id.toString()),
});

authRouter.post('/register', validateRequest({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, displayName, baseCurrency } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new AppError({
        message: 'An account with this email already exists.',
        statusCode: 409,
        code: 'DUPLICATE_EMAIL',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email,
      passwordHash,
      displayName,
      baseCurrency,
    });

    sendSuccess(res, toAuthPayload(user), 201);
  } catch (error) {
    if (error?.code === 11000) {
      next(
        new AppError({
          message: 'An account with this email already exists.',
          statusCode: 409,
          code: 'DUPLICATE_EMAIL',
        }),
      );
      return;
    }

    next(error);
  }
});

authRouter.post('/login', validateRequest({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AuthError('Invalid email or password');
    }

    sendSuccess(res, toAuthPayload(user));
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  sendSuccess(res, {
    user: serializeUser(req.authUser),
  });
});

export { authRouter };
