import { AuthError } from '../errors/app-error.js';
import { User } from '../models/user.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth = async (req, _res, next) => {
  try {
    const authorizationHeader = req.header('authorization');

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new AuthError('Missing or invalid authorization header');
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();

    if (!token) {
      throw new AuthError('Missing access token');
    }

    const payload = verifyAccessToken(token);
    const userId = typeof payload === 'string' ? null : payload?.sub;

    if (!userId || typeof userId !== 'string') {
      throw new AuthError('Invalid access token');
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new AuthError('User not found for access token');
    }

    req.authUser = user;
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      next(error);
      return;
    }

    next(new AuthError('Invalid or expired access token'));
  }
};
