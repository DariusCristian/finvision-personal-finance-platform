import { rateLimit } from 'express-rate-limit';

import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

// Rate limits for brute-force-prone and costly endpoints (AUDIT.md finding 4). Limits come from env; RATE_LIMIT_ENABLED=false
// turns them off (the test runtime does this so the normal suite isn't throttled).

const passThrough = (_req, _res, next) => next();

const createLimiter = ({ max, windowMs, message, ...options }) => {
  if (!env.RATE_LIMIT_ENABLED) {
    return passThrough;
  }

  return rateLimit({
    limit: max,
    windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError({ message, statusCode: 429, code: 'RATE_LIMITED' }));
    },
    ...options,
  });
};

// Counts failed logins only, so a user who signs in successfully is never locked out by their own logins.
export const loginRateLimit = createLimiter({
  max: env.LOGIN_RATE_LIMIT_MAX,
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  skipSuccessfulRequests: true,
  message: 'Too many failed login attempts. Please try again later.',
});

export const registerRateLimit = createLimiter({
  max: env.REGISTER_RATE_LIMIT_MAX,
  windowMs: env.REGISTER_RATE_LIMIT_WINDOW_MS,
  message: 'Too many sign-up attempts. Please try again later.',
});

export const refreshRateLimit = createLimiter({
  max: env.REFRESH_RATE_LIMIT_MAX,
  windowMs: env.REFRESH_RATE_LIMIT_WINDOW_MS,
  message: 'Too many token refresh requests. Please try again later.',
});

// Applied after requireAuth: limits each user rather than each IP, since every chat message calls Gemini.
export const finnyChatRateLimit = createLimiter({
  max: env.FINNY_CHAT_RATE_LIMIT_MAX,
  windowMs: env.FINNY_CHAT_RATE_LIMIT_WINDOW_MS,
  keyGenerator: (req) => req.authUser._id.toString(),
  message: 'Finny is getting a lot of questions from you. Please wait a moment and try again.',
});
