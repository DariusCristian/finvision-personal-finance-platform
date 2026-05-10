import mongoose from 'mongoose';

const portfolioTradeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assetType: {
      type: String,
      enum: ['crypto', 'stock'],
      required: true,
      default: 'crypto',
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
    coinId: {
      type: String,
      required: false,
      default: null,
      trim: true,
      lowercase: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    side: {
      type: String,
      enum: ['buy', 'sell'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.00000001,
    },
    price: {
      type: Number,
      alias: 'priceEUR',
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      alias: 'totalEUR',
      required: true,
      min: 0,
    },
    executedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    executedPriceOriginal: {
      type: Number,
      required: false,
      min: 0,
      default: null,
    },
    originalCurrency: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      default: null,
    },
    fxRateToEur: {
      type: Number,
      required: false,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

portfolioTradeSchema.index({ userId: 1, accountType: 1, mode: 1, executedAt: -1, createdAt: -1 });

portfolioTradeSchema.pre('validate', function normalizeAssetIdentity(next) {
  if (this.assetType === 'stock') {
    this.accountType = 'stocks';
  }

  if (this.assetType === 'crypto') {
    this.accountType = 'crypto';
  }

  if (this.assetType === 'stock') {
    this.coinId = null;
  }

  if (this.assetType === 'crypto' && (!this.coinId || !String(this.coinId).trim())) {
    this.invalidate('coinId', 'coinId is required for crypto trades.');
  }

  next();
});

export const PortfolioTrade =
  mongoose.models.PortfolioTrade ??
  mongoose.model('PortfolioTrade', portfolioTradeSchema);

export const backfillPortfolioTradeAssetType = async () => {
  await PortfolioTrade.updateMany(
    {
      assetType: { $exists: false },
    },
    {
      $set: { assetType: 'crypto' },
    },
  );
};

export const backfillPortfolioTradeAccountType = async () => {
  await PortfolioTrade.updateMany(
    {
      accountType: { $exists: false },
      assetType: 'stock',
    },
    {
      $set: { accountType: 'stocks' },
    },
  );

  await PortfolioTrade.updateMany(
    {
      accountType: { $exists: false },
      $or: [{ assetType: { $exists: false } }, { assetType: 'crypto' }],
    },
    {
      $set: { accountType: 'crypto' },
    },
  );
};

export const backfillPortfolioTradeMode = async () => {
  await PortfolioTrade.updateMany(
    {
      mode: { $exists: false },
    },
    {
      $set: { mode: 'funded' },
    },
  );
};

export const backfillPortfolioTradeExecutedAt = async () => {
  await PortfolioTrade.updateMany(
    {
      executedAt: { $exists: false },
      createdAt: { $exists: true },
    },
    [
      {
        $set: {
          executedAt: '$createdAt',
        },
      },
    ],
  );
};
