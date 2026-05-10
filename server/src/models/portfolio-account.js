import mongoose from 'mongoose';

const portfolioAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: ['crypto', 'stocks'],
      required: true,
      default: 'crypto',
      index: true,
    },
    mode: {
      type: String,
      enum: ['funded', 'demo'],
      required: true,
      default: 'funded',
      index: true,
    },
    baseCurrency: {
      type: String,
      enum: ['EUR'],
      required: true,
      default: 'EUR',
    },
    cashBalance: {
      type: Number,
      alias: 'cashBalanceEUR',
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

portfolioAccountSchema.index(
  { userId: 1, accountType: 1, mode: 1 },
  { unique: true },
);

export const PortfolioAccount =
  mongoose.models.PortfolioAccount ??
  mongoose.model('PortfolioAccount', portfolioAccountSchema);

export const backfillPortfolioAccountType = async () => {
  await PortfolioAccount.updateMany(
    {
      accountType: { $exists: false },
    },
    {
      $set: { accountType: 'crypto' },
    },
  );
};

export const backfillPortfolioAccountMode = async () => {
  await PortfolioAccount.updateMany(
    {
      mode: { $exists: false },
    },
    {
      $set: { mode: 'funded' },
    },
  );
};

export const ensureStockPortfolioAccounts = async () => {
  const cryptoAccounts = await PortfolioAccount.find(
    { accountType: 'crypto' },
    { userId: 1 },
  );

  if (cryptoAccounts.length === 0) {
    return;
  }

  const userIds = [...new Set(cryptoAccounts.map((account) => String(account.userId)))];
  const existingStockAccounts = await PortfolioAccount.find(
    {
      userId: { $in: userIds },
      accountType: 'stocks',
    },
    { userId: 1, mode: 1 },
  );
  const existingByUserAndMode = new Set(
    existingStockAccounts.map((account) => `${String(account.userId)}:${String(account.mode || 'funded')}`),
  );

  const accountsToCreate = userIds.flatMap((userId) => {
    const fundedKey = `${userId}:funded`;
    const demoKey = `${userId}:demo`;
    const pending = [];

    if (!existingByUserAndMode.has(fundedKey)) {
      pending.push({
        userId,
        accountType: 'stocks',
        mode: 'funded',
        baseCurrency: 'EUR',
        cashBalance: 0,
      });
    }

    if (!existingByUserAndMode.has(demoKey)) {
      pending.push({
        userId,
        accountType: 'stocks',
        mode: 'demo',
        baseCurrency: 'EUR',
        cashBalance: 5000,
      });
    }

    return pending;
  });

  if (accountsToCreate.length > 0) {
    await PortfolioAccount.insertMany(accountsToCreate, { ordered: false });
  }
};
