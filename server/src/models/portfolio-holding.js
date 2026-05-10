import mongoose from 'mongoose';

const portfolioHoldingSchema = new mongoose.Schema(
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
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    coinId: {
      type: String,
      required: false,
      default: null,
      trim: true,
      lowercase: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    avgCost: {
      type: Number,
      alias: 'avgCostEUR',
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

portfolioHoldingSchema.index(
  { userId: 1, accountType: 1, mode: 1, assetType: 1, coinId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accountType: 'crypto',
      assetType: 'crypto',
      coinId: { $type: 'string' },
    },
  },
);
portfolioHoldingSchema.index(
  { userId: 1, accountType: 1, mode: 1, assetType: 1, symbol: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accountType: 'stocks',
      assetType: 'stock',
    },
  },
);

portfolioHoldingSchema.pre('validate', function normalizeAssetIdentity(next) {
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
    this.invalidate('coinId', 'coinId is required for crypto holdings.');
  }

  next();
});

export const PortfolioHolding =
  mongoose.models.PortfolioHolding ??
  mongoose.model('PortfolioHolding', portfolioHoldingSchema);

export const backfillPortfolioHoldingAssetType = async () => {
  await PortfolioHolding.updateMany(
    {
      assetType: { $exists: false },
    },
    {
      $set: { assetType: 'crypto' },
    },
  );
};

export const backfillPortfolioHoldingAccountType = async () => {
  await PortfolioHolding.updateMany(
    {
      accountType: { $exists: false },
      assetType: 'stock',
    },
    {
      $set: { accountType: 'stocks' },
    },
  );

  await PortfolioHolding.updateMany(
    {
      accountType: { $exists: false },
      $or: [{ assetType: { $exists: false } }, { assetType: 'crypto' }],
    },
    {
      $set: { accountType: 'crypto' },
    },
  );
};

export const backfillPortfolioHoldingMode = async () => {
  await PortfolioHolding.updateMany(
    {
      mode: { $exists: false },
    },
    {
      $set: { mode: 'funded' },
    },
  );
};
