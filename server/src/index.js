import 'dotenv/config';

import { app } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './database/mongoose.js';
import { Article } from './models/article.js';
import { ensureSystemCategories } from './models/category.js';
import { InvestFunding } from './models/invest-funding.js';
import { Insight } from './models/insight.js';
import { InvestingWalletLedger } from './models/investing-wallet-ledger.js';
import { InvestingWallet } from './models/investing-wallet.js';
import { Question } from './models/question.js';
import {
  backfillPortfolioAccountMode,
  backfillPortfolioAccountType,
  ensureStockPortfolioAccounts,
  PortfolioAccount,
} from './models/portfolio-account.js';
import {
  backfillPortfolioHoldingAccountType,
  backfillPortfolioHoldingAssetType,
  backfillPortfolioHoldingMode,
  PortfolioHolding,
} from './models/portfolio-holding.js';
import {
  backfillPortfolioSnapshotAccountType,
  backfillPortfolioSnapshotMode,
  PortfolioSnapshot,
} from './models/portfolio-snapshot.js';
import {
  backfillPortfolioTradeAccountType,
  backfillPortfolioTradeAssetType,
  backfillPortfolioTradeExecutedAt,
  backfillPortfolioTradeMode,
  PortfolioTrade,
} from './models/portfolio-trade.js';
import { QuizAttempt } from './models/quiz-attempt.js';
import { Quiz } from './models/quiz.js';
import { Transaction } from './models/transaction.js';
import { UserProgress } from './models/user-progress.js';
import { logger } from './utils/logger.js';

let server;

const normalizeLegacyFundedCryptoCashBalances = async () => {
  const fundedAccounts = await PortfolioAccount.find(
    {
      accountType: 'crypto',
      mode: 'funded',
      cashBalance: { $gt: 0 },
    },
    {
      _id: 1,
      userId: 1,
      cashBalance: 1,
    },
  ).lean();

  if (fundedAccounts.length === 0) {
    return;
  }

  const candidateUserIds = [...new Set(fundedAccounts.map((account) => String(account.userId)))];
  const [fundingUserIds, walletLedgerUserIds] = await Promise.all([
    InvestFunding.distinct('userId', {
      userId: { $in: candidateUserIds },
      mode: 'funded',
      toAmount: { $gt: 0 },
    }),
    InvestingWalletLedger.distinct('userId', {
      userId: { $in: candidateUserIds },
      type: 'fx_convert_to_eur',
      $and: [
        {
          $or: [{ 'meta.targetAccountType': 'crypto' }, { 'meta.targetAccountType': { $exists: false } }],
        },
        {
          $or: [{ 'meta.targetMode': 'funded' }, { 'meta.targetMode': { $exists: false } }],
        },
      ],
    }),
  ]);
  const usersWithTopupHistory = new Set([...fundingUserIds, ...walletLedgerUserIds].map((value) => String(value)));

  const accountsToReset = fundedAccounts.filter((account) => !usersWithTopupHistory.has(String(account.userId)));

  if (accountsToReset.length === 0) {
    return;
  }

  await PortfolioAccount.bulkWrite(
    accountsToReset.map((account) => ({
      updateOne: {
        filter: { _id: account._id },
        update: {
          $set: {
            cashBalance: 0,
          },
        },
      },
    })),
    {
      ordered: false,
    },
  );

  logger.warn('invest.funded_cash_legacy_backfill', {
    scannedAccounts: fundedAccounts.length,
    correctedAccounts: accountsToReset.length,
    correctedUserIds: [...new Set(accountsToReset.map((account) => String(account.userId)))],
  });
};

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
    await Promise.all([
      backfillPortfolioAccountType(),
      backfillPortfolioAccountMode(),
      backfillPortfolioHoldingAssetType(),
      backfillPortfolioHoldingAccountType(),
      backfillPortfolioHoldingMode(),
      backfillPortfolioTradeAssetType(),
      backfillPortfolioTradeAccountType(),
      backfillPortfolioTradeMode(),
      backfillPortfolioTradeExecutedAt(),
      backfillPortfolioSnapshotAccountType(),
      backfillPortfolioSnapshotMode(),
    ]);
    await normalizeLegacyFundedCryptoCashBalances();
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
      Insight.syncIndexes(),
      PortfolioHolding.syncIndexes(),
      PortfolioTrade.syncIndexes(),
      PortfolioSnapshot.syncIndexes(),
    ]);
    await ensureStockPortfolioAccounts();

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
