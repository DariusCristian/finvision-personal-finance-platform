import { randomUUID } from 'node:crypto';

import { User } from '../models/user.js';
import { createRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '../utils/jwt.js';

// Refresh-token sessions (AUDIT.md finding 3): each refresh token carries a `jti` that must match an active session
// on the user. Refreshing replaces the session (rotation) and logging out removes it, so an old or logged-out
// refresh token is rejected. Sessions are per device, so one device's refresh doesn't sign out the others.

const MAX_SESSIONS_PER_USER = 10;

const createSession = () => ({
  jti: randomUUID(),
  expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
});

// Keeps the unexpired sessions except `replacedJti`, appends `session` and keeps the newest MAX_SESSIONS_PER_USER.
const nextSessions = (session, replacedJti = null) => ({
  $slice: [
    {
      $concatArrays: [
        {
          $filter: {
            input: { $ifNull: ['$refreshSessions', []] },
            as: 'existing',
            cond: {
              $and: [{ $gt: ['$$existing.expiresAt', '$$NOW'] }, { $ne: ['$$existing.jti', replacedJti] }],
            },
          },
        },
        { $literal: [session] },
      ],
    },
    -MAX_SESSIONS_PER_USER,
  ],
});

export const issueRefreshToken = async (userId) => {
  const session = createSession();
  await User.updateOne({ _id: userId }, [{ $set: { refreshSessions: nextSessions(session) } }]);

  return createRefreshToken(String(userId), session.jti);
};

// Returns a new refresh token, or null when `jti` is not an active session (already rotated, revoked or expired).
// The check and the replacement are one update, so two concurrent refreshes with the same token can't both succeed.
export const rotateRefreshToken = async (userId, jti) => {
  const session = createSession();
  const result = await User.updateOne(
    { _id: userId, refreshSessions: { $elemMatch: { jti, expiresAt: { $gt: new Date() } } } },
    [{ $set: { refreshSessions: nextSessions(session, jti) } }],
  );

  return result.modifiedCount === 1 ? createRefreshToken(String(userId), session.jti) : null;
};

export const revokeRefreshToken = (userId, jti) =>
  User.updateOne({ _id: userId }, { $pull: { refreshSessions: { jti } } });
