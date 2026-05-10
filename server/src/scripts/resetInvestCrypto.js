import mongoose from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { InvestFunding } from '../models/invest-funding.js';
import { PortfolioAccount } from '../models/portfolio-account.js';
import { PortfolioHolding } from '../models/portfolio-holding.js';
import { PortfolioSnapshot } from '../models/portfolio-snapshot.js';
import { PortfolioTrade } from '../models/portfolio-trade.js';
import { User } from '../models/user.js';

const CRYPTO_ACCOUNT_TYPE = 'crypto';
const FUNDED_MODE = 'funded';
const DEMO_MODE = 'demo';
const FUNDED_START_BALANCE_EUR = 0;
const DEMO_START_BALANCE_EUR = 5000;

const parseUserIdArg = () => {
  const arg = process.argv.find((item) => item.startsWith('--userId='));

  if (!arg) {
    return null;
  }

  const value = arg.split('=')[1]?.trim() ?? '';
  return value.length > 0 ? value : null;
};

const resolveTargetUserIds = async () => {
  const requestedUserId = parseUserIdArg();

  if (requestedUserId) {
    if (!mongoose.isValidObjectId(requestedUserId)) {
      throw new Error(`Invalid --userId value: ${requestedUserId}`);
    }

    return [requestedUserId];
  }

  const users = await User.find({}, { _id: 1 }).lean();
  return users.map((user) => String(user._id));
};

const run = async () => {
  await connectToDatabase();

  try {
    const userIds = await resolveTargetUserIds();

    if (userIds.length === 0) {
      console.log('No users found. Nothing to reset.');
      return;
    }

    await Promise.all([
      PortfolioHolding.deleteMany({
        userId: { $in: userIds },
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      PortfolioTrade.deleteMany({
        userId: { $in: userIds },
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      PortfolioSnapshot.deleteMany({
        userId: { $in: userIds },
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      PortfolioAccount.deleteMany({
        userId: { $in: userIds },
        accountType: CRYPTO_ACCOUNT_TYPE,
      }),
      InvestFunding.deleteMany({
        userId: { $in: userIds },
      }),
    ]);

    const accountsToInsert = userIds.flatMap((userId) => ([
      {
        userId,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: FUNDED_MODE,
        baseCurrency: 'EUR',
        cashBalance: FUNDED_START_BALANCE_EUR,
      },
      {
        userId,
        accountType: CRYPTO_ACCOUNT_TYPE,
        mode: DEMO_MODE,
        baseCurrency: 'EUR',
        cashBalance: DEMO_START_BALANCE_EUR,
      },
    ]));

    await PortfolioAccount.insertMany(accountsToInsert, { ordered: false });

    await User.updateMany(
      {
        _id: { $in: userIds },
      },
      {
        $set: { investCryptoMode: null },
      },
    );

    console.log(`Reset crypto invest data for ${userIds.length} user(s).`);
  } finally {
    await disconnectFromDatabase();
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('resetInvestCrypto failed:', error?.message ?? error);
    process.exit(1);
  });
