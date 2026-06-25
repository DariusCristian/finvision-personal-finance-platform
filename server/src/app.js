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
import { budgetRouter } from './routes/v1/budget.js';
import { categoryRouter } from './routes/v1/categories.js';
import { educationRouter } from './routes/v1/education.js';
import { exportsRouter } from './routes/v1/exports.js';
import finnyRouter from './routes/v1/finny.js';
import { investRouter } from './routes/v1/invest.js';
import { insightsRouter } from './routes/v1/insights.js';
import { investingWalletRouter } from './routes/v1/investing-wallet.js';
import { marketCryptoRouter } from './routes/v1/market-crypto.js';
import { marketStocksRouter } from './routes/v1/market-stocks.js';
import { newsRouter } from './routes/v1/news.js';
import { pingRouter } from './routes/v1/ping.js';
import { profileRouter } from './routes/v1/profile.js';
import { transactionRouter } from './routes/v1/transactions.js';

const app = express();

// middleware global - ruleaza pe orice request, in ordinea asta
app.use(requestIdMiddleware);      // ataseaza un ID unic fiecarui request
app.use(requestLoggerMiddleware);  // logeaza in consola: metoda, path, status, timp
app.use(helmet());                 // seteaza headere HTTP de securitate automat
app.use(cors(getCorsOptions(env.corsOrigins))); // permite request-uri doar de la clientul autorizat
app.use(express.json({ limit: '1mb' }));        // parseaza body-ul JSON, fara asta req.body e undefined

// rute - Express trimite request-ul la primul prefix care se potriveste
app.use('/healthz', healthRouter);
app.use('/api/v1', pingRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/budget', budgetRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/education', educationRouter);
app.use('/api/v1/exports', exportsRouter);
app.use('/api/v1/finny', finnyRouter);
app.use('/api/v1/invest', investRouter);
app.use('/api/v1/insights', insightsRouter);
app.use('/api/v1/investing-wallet', investingWalletRouter);
app.use('/api/v1/market/crypto', marketCryptoRouter);
app.use('/api/v1/market/stocks', marketStocksRouter);
app.use('/api/v1/news', newsRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/transactions', transactionRouter);

// trebuie sa fie ultimele - Express le apeleaza doar daca nicio ruta nu a raspuns
app.use(notFoundHandler); // nicio ruta nu a matched -> 404
app.use(errorHandler);    // o ruta a aruncat o eroare -> 500

export { app };
