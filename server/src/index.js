import { app } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './database/mongoose.js';
import { Article } from './models/article.js';
import { ensureSystemCategories } from './models/category.js';
import { InvestFunding } from './models/invest-funding.js';
import { InvestingWalletLedger } from './models/investing-wallet-ledger.js';
import { InvestingWallet } from './models/investing-wallet.js';
import { Question } from './models/question.js';
import { PortfolioAccount } from './models/portfolio-account.js';
import {
  backfillPortfolioHoldingAssetType,
  PortfolioHolding,
} from './models/portfolio-holding.js';
import { PortfolioSnapshot } from './models/portfolio-snapshot.js';
import { backfillPortfolioTradeAssetType, PortfolioTrade } from './models/portfolio-trade.js';
import { QuizAttempt } from './models/quiz-attempt.js';
import { Quiz } from './models/quiz.js';
import { Transaction } from './models/transaction.js';
import { UserProgress } from './models/user-progress.js';
import { logger } from './utils/logger.js';

let server;

const start = async () => {
  try {
    if (env.NODE_ENV === 'development' && !env.MARKETAUX_API_KEY) {
      logger.warn('news.marketaux.missing_api_key', {
        message: 'MARKETAUX_API_KEY is missing. /api/v1/news will return 501 until it is configured.',
      });
    }

    if (env.NODE_ENV === 'development' && !env.COINGECKO_API_KEY) {
      logger.warn('invest.coingecko.missing_api_key', {
        message:
          'COINGECKO_API_KEY is missing. /api/v1/invest and /api/v1/market/crypto will return 501 until it is configured.',
      });
    }

    if (env.NODE_ENV === 'development' && !env.FINNHUB_API_KEY) {
      logger.warn('market.stocks.finnhub.missing_api_key', {
        message:
          'FINNHUB_API_KEY is missing. /api/v1/market/stocks will return 501 until it is configured.',
      });
    }

    await connectToDatabase();
    await Promise.all([backfillPortfolioHoldingAssetType(), backfillPortfolioTradeAssetType()]);
    await Promise.all([
      ensureSystemCategories(),
      Article.syncIndexes(),
      Quiz.syncIndexes(),
      Question.syncIndexes(),
      QuizAttempt.syncIndexes(),
      UserProgress.syncIndexes(),
      Transaction.syncIndexes(),
      PortfolioAccount.syncIndexes(),
      InvestFunding.syncIndexes(),
      InvestingWallet.syncIndexes(),
      InvestingWalletLedger.syncIndexes(),
      PortfolioHolding.syncIndexes(),
      PortfolioTrade.syncIndexes(),
      PortfolioSnapshot.syncIndexes(),
    ]);

    server = app.listen(env.PORT, () => {
      logger.info('server.started', {
        port: env.PORT,
        env: env.NODE_ENV,
      });
    });
  } catch (error) {
    logger.error('server.start_failed', {
      message: error?.message ?? 'Unknown startup error',
      stack: error?.stack,
    });
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  logger.info('server.shutdown_requested', { signal });

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await disconnectFromDatabase();
    logger.info('server.shutdown_complete', { signal });
    process.exit(0);
  } catch (error) {
    logger.error('server.shutdown_failed', {
      signal,
      message: error?.message ?? 'Unknown shutdown error',
      stack: error?.stack,
    });
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  logger.error('server.unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('server.uncaught_exception', {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

void start();
