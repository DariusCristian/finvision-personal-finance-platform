import mongoose from 'mongoose';

const RECURRENCE_VALUES = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'annually'];
const PAYMENT_METHOD_VALUES = ['card', 'cash', 'bank'];

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      enum: ['RON', 'EUR', 'USD'],
      default: 'RON',
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      default: null,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrence: {
      type: String,
      enum: RECURRENCE_VALUES,
      default: 'none',
      required: true,
    },
    nextOccurrenceAt: {
      type: Date,
      default: null,
    },
    recurrenceEndDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, categoryId: 1 });

const Transaction =
  mongoose.models.Transaction ?? mongoose.model('Transaction', transactionSchema);

export { PAYMENT_METHOD_VALUES, RECURRENCE_VALUES, Transaction };
