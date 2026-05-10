import { Insight } from '../models/insight.js';

const normalizeActions = (actions) => {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .map((action) => {
      if (!action || typeof action !== 'object') {
        return null;
      }

      const label = typeof action.label === 'string' ? action.label.trim() : '';
      const href = typeof action.href === 'string' ? action.href.trim() : '';
      const variant = typeof action.variant === 'string' ? action.variant : 'secondary';

      if (!label || !href) {
        return null;
      }

      return {
        label,
        href,
        variant,
      };
    })
    .filter(Boolean);
};

export const serializeInsight = (insight) => {
  const related = insight?.related ?? {};
  const relatedTransactionId = related?.transactionId?.toString?.() ?? null;
  const relatedHoldingSymbol = typeof related?.holdingSymbol === 'string' ? related.holdingSymbol : null;
  const relatedMonth = typeof related?.month === 'string' ? related.month : null;
  const relatedCategoryId = related?.categoryId?.toString?.() ?? null;
  const whatNoticed = insight?.whatNoticed ?? '';

  return {
    id: insight?._id?.toString?.() ?? '',
    userId: insight?.userId?.toString?.() ?? '',
    type: insight?.type ?? 'SUBSCRIPTION_NO_END',
    severity: insight?.severity ?? 'medium',
    title: insight?.title ?? 'Finny insight',
    whatNoticed,
    whyMatters: insight?.whyMatters ?? '',
    whatYouCanDo: insight?.whatYouCanDo ?? '',
    actions: normalizeActions(insight?.actions),
    related: {
      transactionId: relatedTransactionId,
      holdingSymbol: relatedHoldingSymbol,
      month: relatedMonth,
      categoryId: relatedCategoryId,
    },
    status: insight?.status ?? 'active',
    createdAt: insight?.createdAt?.toISOString?.() ?? null,
    updatedAt: insight?.updatedAt?.toISOString?.() ?? null,

    // Backward-compatible fields used in existing client widgets.
    message: whatNoticed,
    relatedTransactionId,
    isActive: insight?.status === 'active',
  };
};

export const getActiveInsightsForUser = async (userId, limit = 5) => Insight.find({
  userId,
  status: 'active',
})
  .sort({ updatedAt: -1, createdAt: -1 })
  .limit(limit);
