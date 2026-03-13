import { logger, redactHeaders } from '../utils/logger.js';

export const requestLoggerMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    logger.info('request.completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      headers: redactHeaders({
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      }),
    });
  });

  next();
};
