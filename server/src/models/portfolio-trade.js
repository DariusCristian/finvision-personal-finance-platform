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
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

portfolioTradeSchema.index({ userId: 1, createdAt: -1 });

portfolioTradeSchema.pre('validate', function normalizeAssetIdentity(next) {
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
