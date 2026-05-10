import { Insight, INSIGHT_TYPE_VALUES } from '../../models/insight.js';

const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
};

const toMonthKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 7);
};

const toMoneyText = (value, currency = 'RON') => {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  return `${safeAmount} ${currency}`;
};

const normalizeRelated = (related = {}) => ({
  transactionId: related.transactionId ?? null,
  holdingSymbol: related.holdingSymbol ?? null,
  month: related.month ?? null,
  categoryId: related.categoryId ?? null,
});

const buildInsightKey = ({ type, related }) => {
  const normalizedRelated = normalizeRelated(related);

  return [
    String(type || ''),
    normalizedRelated.transactionId ? String(normalizedRelated.transactionId) : '',
    normalizedRelated.holdingSymbol ? String(normalizedRelated.holdingSymbol) : '',
    normalizedRelated.month ? String(normalizedRelated.month) : '',
    normalizedRelated.categoryId ? String(normalizedRelated.categoryId) : '',
  ].join('|');
};

const sortInsights = (insights) => [...insights].sort((left, right) => {
  const severityDelta = (SEVERITY_RANK[right.severity] || 0) - (SEVERITY_RANK[left.severity] || 0);

  if (severityDelta !== 0) {
    return severityDelta;
  }

  const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
  const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();

  return rightTime - leftTime;
});

const buildSubscriptionInsights = (context) => {
  const recurringWithoutEnd = (context.recurringTransactions ?? []).filter((transaction) => (
    transaction.type === 'expense' && transaction.isRecurring && transaction.recurrenceEndDate === null
  ));

  return recurringWithoutEnd.map((transaction) => {
    const description = transaction.description?.trim() || 'Recurring subscription';
    const recurrenceLabel = transaction.recurrence && transaction.recurrence !== 'none'
      ? transaction.recurrence
      : 'recurring';

    return {
      type: 'SUBSCRIPTION_NO_END',
      severity: 'medium',
      title: `Subscription alert: ${description}`,
      whatNoticed: `${description} is billed ${recurrenceLabel} at ${toMoneyText(transaction.amount, transaction.currency)} with no end date set.`,
      whyMatters: 'Unused subscriptions can silently drain your budget month after month.',
      whatYouCanDo: 'Set an end date so you remember to review this subscription and cancel if needed.',
      actions: [
        { label: 'Set end date', href: `/budget?openEditTx=${transaction.id}`, variant: 'primary' },
        { label: 'Open Budget', href: '/budget', variant: 'secondary' },
        { label: 'View recurring expenses', href: '/budget?filter=recurring', variant: 'link' },
      ],
      related: {
        transactionId: transaction.id,
      },
    };
  });
};

const buildBudgetPaceWarningInsight = (context) => {
  const budget = context.budget ?? null;

  if (!budget || Number(budget.budgetGoal || 0) <= 0) {
    return [];
  }

  const budgetGoal = Number(budget.budgetGoal || 0);
  const expenseToDate = Number(budget.expenseToDate || 0);
  const daysInMonth = Math.max(1, Number(budget.daysInMonth || 1));
  const daysPassed = Math.max(1, Math.min(daysInMonth, Number(budget.daysPassed || daysInMonth)));
  const expectedSpendToDate = budgetGoal * (daysPassed / daysInMonth);
  const tolerance = Math.max(20, budgetGoal * 0.05);

  if (expenseToDate <= expectedSpendToDate + tolerance) {
    return [];
  }

  const overspend = expenseToDate - expectedSpendToDate;
  const severity = overspend > budgetGoal * 0.15 ? 'high' : 'medium';

  return [
    {
      type: 'BUDGET_PACE_WARNING',
      severity,
      title: 'Budget pace warning',
      whatNoticed: `By day ${daysPassed} of ${daysInMonth}, you spent ${toMoneyText(expenseToDate, context.profile?.baseCurrency)} versus a pace target of ${toMoneyText(expectedSpendToDate, context.profile?.baseCurrency)}.`,
      whyMatters: 'If this pace continues, you are likely to exceed your monthly budget goal.',
      whatYouCanDo: 'Review your top discretionary expenses and cap non-essential spending for the rest of the month.',
      actions: [
        { label: 'Open Budget', href: '/budget', variant: 'primary' },
        { label: 'Review expenses', href: '/budget?sort=-amount', variant: 'secondary' },
        { label: 'Ask Finny for tips', href: '/finny', variant: 'link' },
      ],
      related: {
        month: budget.monthKey ?? toMonthKey(),
      },
    },
  ];
};

const buildInvestingUnfundedInsight = (context) => {
  const results = [];
  const monthKey = context.budget?.monthKey ?? toMonthKey();

  const cryptoMode = context.investing?.crypto?.selectedMode;
  const cryptoBuyingPower = Number(context.investing?.crypto?.buyingPower || 0);

  if (cryptoMode === 'funded' && cryptoBuyingPower <= 0) {
    results.push({
      type: 'INVESTING_UNFUNDED',
      severity: 'medium',
      title: 'Crypto investing account is unfunded',
      whatNoticed: 'Your funded crypto account currently has 0 buying power.',
      whyMatters: 'You cannot place new crypto buy orders without available cash balance.',
      whatYouCanDo: 'Top up your investing balance from wallet or switch to demo mode for practice.',
      actions: [
        { label: 'Open Invest', href: '/invest', variant: 'primary' },
        { label: 'Open Wallet', href: '/invest?tab=wallet', variant: 'secondary' },
        { label: 'Try demo mode', href: '/invest', variant: 'link' },
      ],
      related: {
        month: monthKey,
      },
    });
  }

  const stocksMode = context.investing?.stocks?.selectedMode;
  const stocksBuyingPower = Number(context.investing?.stocks?.buyingPower || 0);

  if (stocksMode === 'funded' && stocksBuyingPower <= 0) {
    results.push({
      type: 'INVESTING_UNFUNDED',
      severity: 'medium',
      title: 'Stock investing account is unfunded',
      whatNoticed: 'Your funded stocks account currently has 0 buying power.',
      whyMatters: 'You cannot place stock buy orders without cash in this account.',
      whatYouCanDo: 'Top up your stocks account or switch to demo mode when testing strategies.',
      actions: [
        { label: 'Open Market', href: '/market', variant: 'primary' },
        { label: 'Top up from wallet', href: '/market', variant: 'secondary' },
        { label: 'Review watchlist', href: '/market', variant: 'link' },
      ],
      related: {
        month: monthKey,
        holdingSymbol: 'STOCKS',
      },
    });
  }

  return results;
};

const buildPortfolioConcentrationInsights = (context) => {
  const concentrated = (context.holdingsAllocations ?? []).filter(
    (holding) => Number(holding.allocationPct || 0) > 60,
  );

  return concentrated.map((holding) => {
    const allocationPct = Number(holding.allocationPct || 0);
    const severity = allocationPct > 75 ? 'high' : 'medium';
    const isStock = holding.accountType === 'stocks';

    return {
      type: 'PORTFOLIO_CONCENTRATION',
      severity,
      title: `${holding.symbol} concentration is high`,
      whatNoticed: `${holding.symbol} is ${allocationPct.toFixed(2)}% of your ${isStock ? 'stocks' : 'crypto'} holdings value.`,
      whyMatters: 'High concentration increases risk when a single asset drops sharply.',
      whatYouCanDo: 'Consider diversifying over time so one position does not dominate your portfolio.',
      actions: [
        { label: isStock ? 'Open Market' : 'Open Invest', href: isStock ? '/market' : '/invest', variant: 'primary' },
        { label: 'Review allocations', href: isStock ? '/market' : '/invest', variant: 'secondary' },
        { label: 'Learn diversification', href: '/learn', variant: 'link' },
      ],
      related: {
        holdingSymbol: holding.symbol,
        month: context.budget?.monthKey ?? toMonthKey(),
      },
    };
  });
};

const buildCandidates = (context) => [
  ...buildSubscriptionInsights(context),
  ...buildBudgetPaceWarningInsight(context),
  ...buildInvestingUnfundedInsight(context),
  ...buildPortfolioConcentrationInsights(context),
].map((candidate) => ({
  ...candidate,
  related: normalizeRelated(candidate.related),
  actions: Array.isArray(candidate.actions) ? candidate.actions : [],
}));

const persistCandidates = async ({ userId, candidates }) => {
  const existingInsights = await Insight.find({
    userId,
    type: { $in: INSIGHT_TYPE_VALUES },
  });

  const existingByKey = new Map(
    existingInsights.map((insight) => {
      const key = buildInsightKey({ type: insight.type, related: insight.related || {} });
      return [key, insight];
    }),
  );

  const activeKeys = new Set();

  for (const candidate of candidates) {
    const key = buildInsightKey(candidate);
    const existing = existingByKey.get(key);

    if (existing?.status === 'dismissed') {
      continue;
    }

    activeKeys.add(key);

    if (!existing) {
      await Insight.create({
        userId,
        ...candidate,
        status: 'active',
      });
      continue;
    }

    await Insight.updateOne(
      { _id: existing._id },
      {
        $set: {
          severity: candidate.severity,
          title: candidate.title,
          whatNoticed: candidate.whatNoticed,
          whyMatters: candidate.whyMatters,
          whatYouCanDo: candidate.whatYouCanDo,
          actions: candidate.actions,
          related: candidate.related,
          status: 'active',
        },
      },
    );
  }

  const staleActiveInsightIds = existingInsights
    .filter((insight) => insight.status === 'active')
    .filter((insight) => {
      const key = buildInsightKey({ type: insight.type, related: insight.related || {} });
      return !activeKeys.has(key);
    })
    .map((insight) => insight._id);

  if (staleActiveInsightIds.length > 0) {
    await Insight.updateMany(
      {
        _id: { $in: staleActiveInsightIds },
      },
      {
        $set: { status: 'dismissed' },
      },
    );
  }
};

export const generateInsights = async ({ userId, context, limit = 10, persist = true }) => {
  const candidates = buildCandidates(context);

  if (persist) {
    await persistCandidates({ userId, candidates });
  }

  const insights = await Insight.find({
    userId,
    status: 'active',
  });

  return sortInsights(insights).slice(0, limit);
};

export const severityRankForInsight = (severity) => SEVERITY_RANK[severity] || 0;
