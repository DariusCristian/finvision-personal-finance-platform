import { randomUUID } from 'node:crypto';

export const requestIdMiddleware = (req, res, next) => {
  const incomingRequestId = req.header('x-request-id');
  const requestId =
    incomingRequestId && incomingRequestId.trim() ? incomingRequestId : randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  next();
};
