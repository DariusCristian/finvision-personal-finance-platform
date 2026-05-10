import mongoose from 'mongoose';

const INSIGHT_TYPE_VALUES = [
  'SUBSCRIPTION_NO_END',
  'BUDGET_PACE_WARNING',
  'INVESTING_UNFUNDED',
  'PORTFOLIO_CONCENTRATION',
];
const INSIGHT_SEVERITY_VALUES = ['low', 'medium', 'high'];
const INSIGHT_STATUS_VALUES = ['active', 'dismissed'];
const INSIGHT_ACTION_VARIANT_VALUES = ['primary', 'secondary', 'link'];

const insightActionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    href: {
      type: String,
      required: true,
      trim: true,
    },
    variant: {
      type: String,
      enum: INSIGHT_ACTION_VARIANT_VALUES,
      default: 'secondary',
      required: true,
    },
  },
  { _id: false },
);

const insightRelatedSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    holdingSymbol: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    month: {
      type: String,
      trim: true,
      default: null,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
  },
  { _id: false },
);

const insightSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: INSIGHT_TYPE_VALUES,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: INSIGHT_SEVERITY_VALUES,
      default: 'medium',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    whatNoticed: {
      type: String,
      required: true,
      trim: true,
    },
    whyMatters: {
      type: String,
      required: true,
      trim: true,
    },
    whatYouCanDo: {
      type: String,
      required: true,
      trim: true,
    },
    actions: {
      type: [insightActionSchema],
      default: [],
    },
    related: {
      type: insightRelatedSchema,
      default: () => ({
        transactionId: null,
        holdingSymbol: null,
        month: null,
        categoryId: null,
      }),
    },
    status: {
      type: String,
      enum: INSIGHT_STATUS_VALUES,
      default: 'active',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

insightSchema.index({ userId: 1, status: 1, updatedAt: -1 });
insightSchema.index({ userId: 1, type: 1, 'related.transactionId': 1 });
insightSchema.index({ userId: 1, type: 1, 'related.holdingSymbol': 1 });
insightSchema.index({ userId: 1, type: 1, 'related.month': 1 });

const Insight = mongoose.models.Insight ?? mongoose.model('Insight', insightSchema);

export {
  INSIGHT_ACTION_VARIANT_VALUES,
  INSIGHT_SEVERITY_VALUES,
  INSIGHT_STATUS_VALUES,
  INSIGHT_TYPE_VALUES,
  Insight,
};
