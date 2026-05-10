import bcrypt from 'bcryptjs';
import { Router } from 'express';

import { AuthError, ConflictError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { User } from '../../models/user.js';
import { createAccessToken } from '../../utils/jwt.js';
import { sendSuccess } from '../../utils/response.js';
import { serializeUser } from '../../utils/serializers.js';
import { loginSchema, registerSchema } from '../../validation/auth.js';

const SALT_ROUNDS = 12;

const authRouter = Router();

const toAuthPayload = (user) => ({
  user: serializeUser(user),
  accessToken: createAccessToken(user._id.toString()),
});

authRouter.post('/register', validateRequest({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, displayName, baseCurrency } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new ConflictError(
        'An account with this email already exists.',
        [],
        'DUPLICATE_EMAIL',
      );
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
        new ConflictError(
          'An account with this email already exists.',
          [],
          'DUPLICATE_EMAIL',
        ),
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

authRouter.post('/logout', (_req, res) => {
  sendSuccess(res, {
    loggedOut: true,
  });
});

export { authRouter };
