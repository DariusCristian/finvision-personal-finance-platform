import { Router } from 'express';

import { sendSuccess } from '../utils/response.js';

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  sendSuccess(res, { status: 'ok' });
});

export { healthRouter };
