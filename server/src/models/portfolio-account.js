import mongoose from 'mongoose';

const portfolioAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
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
      required: true,
      default: 10000,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const PortfolioAccount =
  mongoose.models.PortfolioAccount ??
  mongoose.model('PortfolioAccount', portfolioAccountSchema);
