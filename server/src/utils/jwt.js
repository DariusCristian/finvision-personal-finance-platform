import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

export const createAccessToken = (userId) => {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
  });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// `jti` identifies the refresh session stored on the user (see services/refresh-sessions.js).
export const createRefreshToken = (userId, jti) => {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    jwtid: jti,
  });
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};
