import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    baseCurrency: {
      type: String,
      enum: ['RON', 'EUR', 'USD'],
      default: 'RON',
      required: true,
    },
    monthlyBudgetGoal: {
      type: Number,
      default: null,
      min: 0,
    },
    investingMonthlyContributionGoal: {
      type: Number,
      default: 0,
      min: 0,
    },
    investingAccountBalance: {
      type: Number,
      default: 0,
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

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
