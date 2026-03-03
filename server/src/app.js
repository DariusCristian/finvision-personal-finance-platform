import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { getCorsOptions } from './config/cors.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/v1/auth.js';
import { categoryRouter } from './routes/v1/categories.js';
import { pingRouter } from './routes/v1/ping.js';
import { profileRouter } from './routes/v1/profile.js';
import { transactionRouter } from './routes/v1/transactions.js';

const app = express();

app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(helmet());
app.use(cors(getCorsOptions(env.corsOrigins)));
app.use(express.json({ limit: '1mb' }));

app.use('/healthz', healthRouter);
app.use('/api/v1', pingRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/transactions', transactionRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
