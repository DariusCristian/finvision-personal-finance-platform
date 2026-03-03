const redactHeaders = (headers) => {
  return {
    authorization: headers.authorization ? '[REDACTED]' : undefined,
    cookie: headers.cookie ? '[REDACTED]' : undefined,
  };
};

export const requestLoggerMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    console.info(
      JSON.stringify({
        level: 'info',
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        headers: redactHeaders(req.headers),
      }),
    );
  });

  next();
};
