import mongoose from 'mongoose';

const RECURRENCE_VALUES = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'annually'];
const PAYMENT_METHOD_VALUES = ['card', 'cash', 'bank'];

const currencyValuesSchema = new mongoose.Schema(
  {
    RON: { type: Number, required: true },
    EUR: { type: Number, required: true },
    USD: { type: Number, required: true },
  },
  { _id: false },
);

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
    // The amount in every supported currency, converted with the rates of the transaction's date, so totals can
    // use the user's current base currency. Unset on transactions created before conversions were stored.
    convertedAmounts: {
      type: currencyValuesSchema,
      default: undefined,
    },
    fxRates: {
      type: currencyValuesSchema,
      default: undefined,
    },
    fxRateDate: {
      type: String,
      default: undefined,
    },
    fxProvider: {
      type: String,
      default: undefined,
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
