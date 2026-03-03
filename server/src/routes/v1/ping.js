import { Router } from 'express';
import { z } from 'zod';

import { validateRequest } from '../../middleware/validate-request.js';
import { sendSuccess } from '../../utils/response.js';

const pingRouter = Router();
const pingQuerySchema = z.object({}).passthrough();

pingRouter.get('/ping', validateRequest({ query: pingQuerySchema }), (_req, res) => {
  sendSuccess(res, { pong: true });
});

export { pingRouter };
