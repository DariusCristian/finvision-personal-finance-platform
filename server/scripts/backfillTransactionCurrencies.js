import mongoose from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../src/database/mongoose.js';
import {
  backfillTransactionCurrencies,
  parseBackfillArgs,
} from '../src/services/currency-backfill.js';

// Stores RON/EUR/USD amounts on transactions created before conversions existed.
//   npm run backfill:transaction-currencies               dry run: reports what would change, writes nothing
//   npm run backfill:transaction-currencies -- --apply    writes the conversions
// Options: --batch-size=N (default 200). Safe to re-run: converted transactions are skipped.

const printReport = (report) => {
  console.log(`\nMode: ${report.mode}`);
  console.log(`Transactions without stored conversions: ${report.candidates}`);
  console.log(`  by currency: ${JSON.stringify(report.byCurrency)}`);
  console.log(`  convertible: ${report.converted}, failed: ${report.failed}`);
  console.log(`Rate lookups (currency + day): ${report.rateRequests}`);

  if (report.samples.length > 0) {
    console.log('\nExamples:');
    for (const sample of report.samples) {
      console.log(
        `  ${sample.id}  ${sample.amount} ${sample.currency} on ${sample.date} -> ` +
          `${JSON.stringify(sample.convertedAmounts)} (rates of ${sample.fxRateDate})`,
      );
    }
  }

  if (report.failures.length > 0) {
    console.log('\nFailed (left unchanged; re-run later):');
    for (const failure of report.failures.slice(0, 20)) {
      console.log(`  ${failure.id}  ${failure.currency} on ${failure.date}: ${failure.reason}`);
    }
  }

  console.log(
    report.mode === 'apply'
      ? `\nUpdated ${report.updated} transactions.`
      : '\nDry run: nothing was written. Re-run with --apply to write these conversions.',
  );
};

const run = async () => {
  try {
    const options = parseBackfillArgs(process.argv.slice(2));
    await connectToDatabase();
    // Host and database name only, so it's clear which database is affected; credentials are never printed.
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);

    const report = await backfillTransactionCurrencies(options);
    printReport(report);

    if (report.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Backfill failed: ${error?.message ?? error}`);
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
};

void run();
