import type { BudgetTransaction } from './api';

// A transaction's amount in `currency` (normally the user's base currency), for totals and charts. Transactions
// without stored conversions (created before they existed and not yet backfilled) fall back to their own amount,
// the same rule the server uses for budget totals.
export const amountInCurrency = (
  transaction: Pick<BudgetTransaction, 'amount' | 'convertedAmounts'>,
  currency: 'RON' | 'EUR' | 'USD',
): number => transaction.convertedAmounts?.[currency] ?? transaction.amount;
