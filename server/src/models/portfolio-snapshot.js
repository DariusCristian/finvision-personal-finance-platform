import mongoose from 'mongoose';

const portfolioSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
    },
    totalValue: {
      type: Number,
      required: true,
      min: 0,
    },
    cashBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    holdingsValue: {
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

portfolioSnapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

export const PortfolioSnapshot =
  mongoose.models.PortfolioSnapshot ??
  mongoose.model('PortfolioSnapshot', portfolioSnapshotSchema);
