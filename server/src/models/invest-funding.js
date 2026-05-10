import mongoose from 'mongoose';

const investFundingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ['funded', 'demo'],
      required: true,
      default: 'funded',
      index: true,
    },
    fromCurrency: {
      type: String,
      enum: ['RON'],
      required: true,
      default: 'RON',
    },
    fromAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    toCurrency: {
      type: String,
      enum: ['EUR'],
      required: true,
      default: 'EUR',
    },
    toAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    provider: {
      type: String,
      required: true,
      default: 'frankfurter',
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

investFundingSchema.index({ userId: 1, mode: 1, createdAt: -1 });

export const InvestFunding =
  mongoose.models.InvestFunding ?? mongoose.model('InvestFunding', investFundingSchema);

export const backfillInvestFundingMode = async () => {
  await InvestFunding.updateMany(
    {
      mode: { $exists: false },
    },
    {
      $set: { mode: 'funded' },
    },
  );
};
