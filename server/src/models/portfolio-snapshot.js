import mongoose from 'mongoose';

const portfolioSnapshotSchema = new mongoose.Schema(
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
    date: {
      type: String,
      required: true,
      trim: true,
    },
    totalValue: {
      type: Number,
      alias: 'totalValueEUR',
      required: true,
      min: 0,
    },
    cashBalance: {
      type: Number,
      alias: 'cashBalanceEUR',
      required: true,
      min: 0,
    },
    holdingsValue: {
      type: Number,
      alias: 'holdingsValueEUR',
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

portfolioSnapshotSchema.index({ userId: 1, accountType: 1, mode: 1, date: 1 }, { unique: true });

export const PortfolioSnapshot =
  mongoose.models.PortfolioSnapshot ??
  mongoose.model('PortfolioSnapshot', portfolioSnapshotSchema);

export const backfillPortfolioSnapshotAccountType = async () => {
  await PortfolioSnapshot.updateMany(
    {
      accountType: { $exists: false },
    },
    {
      $set: { accountType: 'crypto' },
    },
  );
};

export const backfillPortfolioSnapshotMode = async () => {
  await PortfolioSnapshot.updateMany(
    {
      mode: { $exists: false },
    },
    {
      $set: { mode: 'funded' },
    },
  );
};
