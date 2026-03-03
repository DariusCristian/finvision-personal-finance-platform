import { AppError } from '../errors/app-error.js';

export const getCorsOptions = (allowlist) => ({
  origin: (origin, callback) => {
    if (!origin || allowlist.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(
      new AppError({
        message: `CORS origin denied: ${origin}`,
        statusCode: 403,
        code: 'CORS_ORIGIN_DENIED',
      }),
    );
  },
  credentials: true,
});
