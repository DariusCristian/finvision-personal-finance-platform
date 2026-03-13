import mongoose from 'mongoose';

const investingWalletLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['deposit', 'withdraw', 'fx_convert_to_eur', 'autofund'],
      required: true,
    },
    amountRON: {
      type: Number,
      required: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

investingWalletLedgerSchema.index({ userId: 1, createdAt: -1 });

export const InvestingWalletLedger =
  mongoose.models.InvestingWalletLedger ??
  mongoose.model('InvestingWalletLedger', investingWalletLedgerSchema);
