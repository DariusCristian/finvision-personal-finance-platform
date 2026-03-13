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
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

portfolioHoldingSchema.index(
  { userId: 1, assetType: 1, coinId: 1 },
  { unique: true, partialFilterExpression: { assetType: 'crypto', coinId: { $type: 'string' } } },
);
portfolioHoldingSchema.index(
  { userId: 1, assetType: 1, symbol: 1 },
  { unique: true, partialFilterExpression: { assetType: 'stock' } },
);

portfolioHoldingSchema.pre('validate', function normalizeAssetIdentity(next) {
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
