import mongoose from 'mongoose';

const investingWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      enum: ['RON'],
      required: true,
      default: 'RON',
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    monthlyGoal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    autoFundEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    autoFundAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    autoFundDayOfMonth: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 28,
    },
    lastAutoFundAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const InvestingWallet =
  mongoose.models.InvestingWallet ?? mongoose.model('InvestingWallet', investingWalletSchema);
