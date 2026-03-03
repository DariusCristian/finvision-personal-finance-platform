import { app } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './database/mongoose.js';
import { ensureSystemCategories } from './models/category.js';
import { Transaction } from './models/transaction.js';

let server;

const start = async () => {
  try {
    await connectToDatabase();
    await Promise.all([ensureSystemCategories(), Transaction.syncIndexes()]);

    server = app.listen(env.PORT, () => {
      console.info(`[server] listening on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('[server] failed to start', error);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  console.info(`[server] received ${signal}, shutting down`);

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
    process.exit(0);
  } catch (error) {
    console.error('[server] graceful shutdown failed', error);
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
  console.error('[server] unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[server] uncaught exception', error);
  process.exit(1);
});

void start();
