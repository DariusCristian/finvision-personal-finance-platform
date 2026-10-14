import { AppError } from '../errors/app-error.js';
import { InvestFunding } from '../models/invest-funding.js';
import { InvestingWalletLedger } from '../models/investing-wallet-ledger.js';
import { creditAccountCash, debitWallet, runInTransaction } from './balance-ops.js';

// Moves money from the investing wallet into a portfolio account's cash in one transaction (AUDIT.md finding 1).
// The FX conversion must happen before calling this: nothing external may run inside the transaction.
// The portfolio account must already exist.
export const topUpAccountFromWallet = ({ userId, accountType, mode, amountRON, amountEUR, ledgerMeta, funding }) =>
  runInTransaction(async (session) => {
    const wallet = await debitWallet(userId, amountRON, { session });

    if (!wallet) {
      throw new AppError({
        message: 'Not enough RON balance in investing wallet.',
        statusCode: 400,
        code: 'INSUFFICIENT_FUNDS',
      });
    }

    const account = await creditAccountCash({ userId, accountType, mode }, amountEUR, { session });

    if (!account) {
      throw new Error(`Portfolio account ${accountType}/${mode} does not exist for user ${userId}.`);
    }

    await InvestingWalletLedger.create(
      [{ userId, type: 'fx_convert_to_eur', amountRON: -amountRON, meta: ledgerMeta }],
      { session },
    );

    await InvestFunding.create(
      [
        {
          userId,
          mode,
          fromCurrency: funding.fromCurrency,
          fromAmount: amountRON,
          toCurrency: funding.toCurrency,
          toAmount: amountEUR,
          rate: funding.rate,
          provider: funding.provider,
        },
      ],
      { session },
    );

    return { wallet, account };
  });
