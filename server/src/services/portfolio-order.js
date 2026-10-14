import { AppError } from '../errors/app-error.js';
import { PortfolioTrade } from '../models/portfolio-trade.js';
import {
  addToHolding,
  creditAccountCash,
  debitAccountCash,
  removeFromHolding,
  runInTransaction,
} from './balance-ops.js';

const QUANTITY_DECIMALS = 8;

// Executes a buy or sell against a portfolio account in one transaction (AUDIT.md finding 1).
// The price must be fetched before calling this: nothing external may run inside the transaction.
// The step that can fail (debit cash on buy, remove quantity on sell) runs first, so a rejected order changes nothing.
// `holdingKey` holds the identity fields of the holding's unique index besides userId/accountType/mode/assetType
// (`{ coinId }` for crypto, `{ symbol }` for stocks); `insertFields` are only set when the holding is created;
// `tradeFields` are extra fields stored on the trade record.
export const executeOrder = async ({
  userId,
  accountType,
  mode,
  assetType,
  holdingKey,
  insertFields,
  side,
  quantity,
  price,
  total,
  tradeFields = {},
}) => {
  if (Number(Number(quantity).toFixed(QUANTITY_DECIMALS)) <= 0) {
    throw new AppError({
      message: 'Quantity is too small.',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const accountKey = { userId, accountType, mode };
  const holdingFilter = { userId, accountType, mode, assetType, ...holdingKey };

  return runInTransaction(async (session) => {
    let account;

    if (side === 'buy') {
      account = await debitAccountCash(accountKey, total, { session });

      if (!account) {
        throw new AppError({
          message: 'Insufficient buying power for this order.',
          statusCode: 400,
          code: 'INSUFFICIENT_FUNDS',
        });
      }

      await addToHolding(holdingFilter, { quantity, price, insertFields }, { session });
    } else {
      const holding = await removeFromHolding(holdingFilter, quantity, { session });

      if (!holding) {
        throw new AppError({
          message: 'Insufficient quantity available to sell.',
          statusCode: 400,
          code: 'INSUFFICIENT_HOLDINGS',
        });
      }

      account = await creditAccountCash(accountKey, total, { session });
    }

    if (!account) {
      throw new Error(`Portfolio account ${accountType}/${mode} does not exist for user ${userId}.`);
    }

    const [trade] = await PortfolioTrade.create(
      [
        {
          userId,
          accountType,
          mode,
          assetType,
          ...holdingKey,
          side,
          quantity,
          price,
          total,
          executedAt: new Date(),
          ...tradeFields,
        },
      ],
      { session },
    );

    return { account, trade };
  });
};
