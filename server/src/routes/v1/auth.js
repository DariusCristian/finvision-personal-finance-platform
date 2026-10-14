import bcrypt from 'bcryptjs';
import { Router } from 'express';

import { AuthError, ConflictError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginRateLimit, refreshRateLimit, registerRateLimit } from '../../middleware/rate-limit.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { User } from '../../models/user.js';
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../../services/refresh-sessions.js';
import { createAccessToken, verifyRefreshToken } from '../../utils/jwt.js';
import { sendSuccess } from '../../utils/response.js';
import { serializeUser } from '../../utils/serializers.js';
import { loginSchema, registerSchema } from '../../validation/auth.js';

const SALT_ROUNDS = 12;

const authRouter = Router();

const toAuthPayload = async (user) => ({
  user: serializeUser(user),
  accessToken: createAccessToken(user._id.toString()),
  refreshToken: await issueRefreshToken(user._id),
});

// Returns the verified payload of a refresh token that carries a session id, or null.
const readRefreshToken = (refreshToken) => {
  if (!refreshToken || typeof refreshToken !== 'string') {
    return null;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    return typeof payload?.sub === 'string' && typeof payload?.jti === 'string' ? payload : null;
  } catch {
    // Invalid signature or expired: treated the same as a missing token.
    return null;
  }
};

authRouter.post('/register', registerRateLimit, validateRequest({ body: registerSchema }), async (req, res, next) => {
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

    sendSuccess(res, await toAuthPayload(user), 201);
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

authRouter.post('/login', loginRateLimit, validateRequest({ body: loginSchema }), async (req, res, next) => {
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

    sendSuccess(res, await toAuthPayload(user));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', refreshRateLimit, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AuthError('Refresh token is required');
    }

    const payload = readRefreshToken(refreshToken);
    // Rotation: the presented token's session is replaced, so it can't be used again after this refresh.
    const nextRefreshToken = payload ? await rotateRefreshToken(payload.sub, payload.jti) : null;

    if (!nextRefreshToken) {
      throw new AuthError('Invalid or expired refresh token');
    }

    sendSuccess(res, {
      accessToken: createAccessToken(payload.sub),
      refreshToken: nextRefreshToken,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  sendSuccess(res, {
    user: serializeUser(req.authUser),
  });
});

// Revokes the refresh token's session. Always succeeds, so logging out works even with an expired access token.
authRouter.post('/logout', async (req, res, next) => {
  try {
    const payload = readRefreshToken(req.body?.refreshToken);

    if (payload) {
      await revokeRefreshToken(payload.sub, payload.jti);
    }

    sendSuccess(res, {
      loggedOut: true,
    });
  } catch (error) {
    next(error);
  }
});

export { authRouter };
