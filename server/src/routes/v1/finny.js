import express from 'express';
import { z } from 'zod';

import { AppError } from '../../errors/app-error.js';
import { generateFinnyReply } from '../../integrations/gemini/geminiClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { inspectIntent, inspectTopicScope } from '../../modules/finny/topicGuard.js';
import { Category } from '../../models/category.js';
import { Transaction } from '../../models/transaction.js';
import { buildInsightContext } from '../../modules/insights/buildInsightContext.js';
import { generateInsights, severityRankForInsight } from '../../modules/insights/generateInsights.js';
import { serializeInsight } from '../../utils/insights.js';
import { sendSuccess } from '../../utils/response.js';

const USER_WINDOW_MS = 60 * 1000;
const USER_MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_STORE_SWEEP_THRESHOLD = 1000;
const userRequestWindowStore = new Map();

const sweepExpiredRateLimitEntries = (windowStart) => {
  for (const [storedUserId, timestamps] of userRequestWindowStore) {
    const stillActive = timestamps.some((timestamp) => timestamp > windowStart);

    if (!stillActive) {
      userRequestWindowStore.delete(storedUserId);
    }
  }
};

const FINNY_CONTEXT_TYPES = ['general', 'budget', 'subscriptions', 'crypto', 'stocks', 'app'];
const FINNY_CONTEXT_TYPE_ENUM = z.enum(FINNY_CONTEXT_TYPES);
const SHOULD_INCLUDE_DEBUG_META = process.env.NODE_ENV !== 'production';
const FINNY_OUT_OF_SCOPE_TEXT =
  "I can't help with that topic. I'm focused on budgeting, savings, net worth, personal finance education, crypto/stock education, and using FinVision. Try one of these: \"Give me saving tips based on my budget\", \"Explain net worth\", \"Check my subscriptions\", \"What is an ETF?\"";

const FINNY_PROVIDER_UNAVAILABLE_TEXT =
  "Finny is a little busy right now and couldn't generate an answer. Please try again in a few seconds.";

const INTENT_VALUES = [
  'SUBSCRIPTIONS_REVIEW',
  'BUDGET_CHECK',
  'TOP_SPENDING_CATEGORIES',
  'HABIT_IMPROVEMENT_30D',
  'SAVING_TIPS',
  'NET_WORTH',
  'FINANCE_EDUCATION',
  'APP_USAGE',
  'OFF_TOPIC',
];

const ANALYSIS_KEYWORDS = [
  'subscription',
  'subscriptions',
  'recurring',
  'renewal',
  'netflix',
  'spotify',
  'hbo',
  'prime',
];

const INTENT_TO_CONTEXT_TYPE = {
  SUBSCRIPTIONS_REVIEW: 'subscriptions',
  BUDGET_CHECK: 'budget',
  TOP_SPENDING_CATEGORIES: 'budget',
  HABIT_IMPROVEMENT_30D: 'budget',
  SAVING_TIPS: 'budget',
  NET_WORTH: 'general',
  FINANCE_EDUCATION: 'general',
  APP_USAGE: 'app',
  OFF_TOPIC: 'general',
};

const CRYPTO_CONTEXT_KEYWORDS = [
  'crypto',
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'solana',
  'xrp',
  'coin',
  'token',
  'altcoin',
  'market cap',
  'crypto price',
];

const STOCKS_CONTEXT_KEYWORDS = [
  'stock',
  'stocks',
  'equity',
  'etf',
  'dividend',
  's&p',
  'nasdaq',
  'dow',
  'ticker',
  'share price',
  'p/e',
];

const INSIGHT_TYPES_BY_CONTEXT = {
  subscriptions: ['SUBSCRIPTION_NO_END', 'BUDGET_PACE_WARNING'],
  budget: ['BUDGET_PACE_WARNING', 'SUBSCRIPTION_NO_END'],
  crypto: ['PORTFOLIO_CONCENTRATION', 'INVESTING_UNFUNDED'],
  stocks: ['PORTFOLIO_CONCENTRATION', 'INVESTING_UNFUNDED'],
  app: [],
  general: ['SUBSCRIPTION_NO_END', 'BUDGET_PACE_WARNING', 'PORTFOLIO_CONCENTRATION', 'INVESTING_UNFUNDED'],
};

const finnyChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  contextType: FINNY_CONTEXT_TYPE_ENUM,
  selectedMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

const consumeUserRateLimit = (userId) => {
  const now = Date.now();
  const windowStart = now - USER_WINDOW_MS;
  const existingTimestamps = userRequestWindowStore.get(userId) ?? [];
  const recentTimestamps = existingTimestamps.filter((timestamp) => timestamp > windowStart);

  if (recentTimestamps.length >= USER_MAX_REQUESTS_PER_WINDOW) {
    userRequestWindowStore.set(userId, recentTimestamps);
    return false;
  }

  recentTimestamps.push(now);
  userRequestWindowStore.set(userId, recentTimestamps);

  if (userRequestWindowStore.size > RATE_LIMIT_STORE_SWEEP_THRESHOLD) {
    sweepExpiredRateLimitEntries(windowStart);
  }

  return true;
};

const includesAnyKeyword = (text, keywords) => keywords.some((keyword) => text.includes(keyword));

const resolveContextType = (requestedContextType, intent, message) => {
  if (requestedContextType !== 'general') {
    return requestedContextType;
  }

  const normalizedMessage = String(message ?? '').trim().toLowerCase();

  if (intent === 'FINANCE_EDUCATION') {
    if (includesAnyKeyword(normalizedMessage, CRYPTO_CONTEXT_KEYWORDS)) {
      return 'crypto';
    }

    if (includesAnyKeyword(normalizedMessage, STOCKS_CONTEXT_KEYWORDS)) {
      return 'stocks';
    }
  }

  return INTENT_TO_CONTEXT_TYPE[intent] ?? 'general';
};

const formatCurrency = (value, currency = 'RON') => {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} ${currency}`;
};

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
};

const getMonthBoundsUtc = (monthKey) => {
  const normalizedMonthKey =
    typeof monthKey === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)
      ? monthKey
      : new Date().toISOString().slice(0, 7);
  const [year, month] = normalizedMonthKey.split('-').map(Number);

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return {
    monthKey: normalizedMonthKey,
    monthStart,
    monthEnd,
  };
};

const getLastDaysRange = (daysBack) => {
  const end = new Date();
  const start = new Date(end.getTime() - Math.max(1, daysBack) * 24 * 60 * 60 * 1000);

  return {
    start,
    end,
  };
};

const computeCategoryTotals = async ({ userId, startDate, endDate }) => {
  const transactions = await Transaction.find({
    userId,
    type: 'expense',
    date: {
      $gte: startDate,
      $lt: endDate,
    },
  }).select('categoryId amount');

  const totalsByCategoryId = new Map();

  for (const transaction of transactions) {
    const categoryId = transaction.categoryId?.toString?.();
    const amount = Math.abs(Number(transaction.amount || 0));

    if (!categoryId || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    totalsByCategoryId.set(categoryId, (totalsByCategoryId.get(categoryId) ?? 0) + amount);
  }

  const categoryIds = [...totalsByCategoryId.keys()];

  if (categoryIds.length === 0) {
    return {
      totals: [],
      totalExpense: 0,
    };
  }

  const categories = await Category.find({
    _id: { $in: categoryIds },
  }).select('name slug');
  const categoryById = new Map(categories.map((category) => [category._id.toString(), category]));

  const totals = categoryIds.map((categoryId) => {
    const amount = totalsByCategoryId.get(categoryId) ?? 0;
    const category = categoryById.get(categoryId);

    return {
      categoryId,
      amount: toMoney(amount),
      name: category?.name ?? 'Uncategorized',
      slug: category?.slug ?? null,
    };
  });

  const totalExpense = toMoney(totals.reduce((sum, item) => sum + item.amount, 0));

  return {
    totals,
    totalExpense,
  };
};

const buildBudgetOverviewCard = ({ insightContext, recurringNoEnd }) => {
  const budget = insightContext.budget ?? {};
  const currency = insightContext.profile.baseCurrency ?? 'RON';
  const budgetGoal = Number(budget.budgetGoal || 0);
  const expenseToDate = Number(budget.expenseToDate || 0);
  const daysPassed = Number(budget.daysPassed || 0);
  const daysInMonth = Number(budget.daysInMonth || 0);
  const expectedToDate =
    budgetGoal > 0 && daysInMonth > 0
      ? budgetGoal * (daysPassed / daysInMonth)
      : 0;
  const paceDelta = expenseToDate - expectedToDate;
  const paceMessage = budgetGoal <= 0
    ? 'Set a monthly budget goal to get pace tracking.'
    : paceDelta > 0
      ? `You are ${formatCurrency(paceDelta, currency)} above pace so far.`
      : `You are ${formatCurrency(Math.abs(paceDelta), currency)} under pace so far.`;

  const sections = [
    {
      heading: 'This month at a glance',
      bullets: [
        `Income: ${formatCurrency(budget.incomeTotal, currency)}`,
        `Expenses: ${formatCurrency(budget.expenseTotal, currency)}`,
        `Remaining budget: ${formatCurrency(budget.remainingBudget, currency)}`,
      ],
    },
    {
      heading: 'Pacing check',
      bullets: [
        `Day ${daysPassed || 0} of ${daysInMonth || 0}.`,
        paceMessage,
      ],
    },
  ];

  if (recurringNoEnd.length > 0) {
    const item = recurringNoEnd[0];
    sections.push({
      heading: 'Also noticed',
      bullets: [
        `${item.description || 'A recurring expense'} has no end date (${formatCurrency(item.amount, item.currency || currency)}).`,
      ],
    });
  }

  return {
    title: 'Budget Overview',
    summary: `Here is your budget snapshot for ${budget.monthKey ?? 'this month'}.`,
    sections,
    actions: [
      { label: 'Open Budget', href: '/budget' },
      { label: 'Review expenses', href: '/budget?sort=-amount' },
    ],
    toneNote: 'educational_not_advice',
    disclaimer: 'Educational info only — not financial advice.',
  };
};

const buildTopSpendingCategoriesCard = ({ monthKey, topCategories, totalExpense, currency }) => {
  if (!Array.isArray(topCategories) || topCategories.length === 0 || totalExpense <= 0) {
    return {
      title: 'Top Spending Categories',
      summary: `I don't have category totals yet for ${monthKey}. Open Budget to see a full breakdown.`,
      sections: [
        {
          heading: 'What I can show now',
          bullets: ['Category totals are not available yet for this period.'],
        },
      ],
      actions: [
        { label: 'Open Budget', href: '/budget' },
        { label: 'View category chart', href: '/budget' },
      ],
      toneNote: 'educational_not_advice',
      disclaimer: 'Educational info only — not financial advice.',
    };
  }

  const bullets = topCategories.map((item) => (
    `${item.name}: ${formatCurrency(item.amount, currency)} (${item.sharePct.toFixed(1)}%)`
  ));

  return {
    title: 'Top Spending Categories',
    summary: `Top spending categories for ${monthKey} based on your recorded expenses.`,
    sections: [
      {
        heading: 'Top 3 categories',
        bullets,
      },
      {
        heading: 'Why this helps',
        bullets: ['Focus on the biggest category first to get the largest budget impact quickly.'],
      },
    ],
    actions: [
      { label: 'Open Budget', href: '/budget' },
      { label: 'Filter by highest expenses', href: '/budget?sort=-amount' },
    ],
    toneNote: 'educational_not_advice',
    disclaimer: 'Educational info only — not financial advice.',
  };
};

const buildHabitImprovementCard = ({ insightContext, topLast30, previousCategoryAmount, recurringNoEnd }) => {
  const currency = insightContext.profile.baseCurrency ?? 'RON';

  if (!topLast30 && recurringNoEnd.length === 0) {
    return {
      title: 'One Habit to Improve',
      summary: "I don't have enough 30-day spending data yet to identify one habit.",
      sections: [
        {
          heading: 'Next step',
          bullets: ['Keep logging expenses for a few days, then ask again for a data-driven habit suggestion.'],
        },
      ],
      actions: [
        { label: 'Open Budget', href: '/budget' },
        { label: 'Add transaction', href: '/budget' },
      ],
      toneNote: 'educational_not_advice',
      disclaimer: 'Educational info only — not financial advice.',
    };
  }

  if (topLast30) {
    const delta = topLast30.amount - (previousCategoryAmount || 0);
    const trendText = delta > 0
      ? `${topLast30.name} is up ${formatCurrency(delta, currency)} vs the previous 30 days.`
      : `${topLast30.name} is down ${formatCurrency(Math.abs(delta), currency)} vs the previous 30 days.`;

    return {
      title: 'One Habit to Improve',
      summary: `The biggest 30-day spending area is ${topLast30.name} at ${formatCurrency(topLast30.amount, currency)}.`,
      sections: [
        {
          heading: 'What I noticed',
          bullets: [trendText],
        },
        {
          heading: 'Habit to try this week',
          bullets: [
            `Set a weekly cap for ${topLast30.name} and do one mid-week check-in before weekend spending.`,
            'Pause one non-essential purchase for 24 hours before buying.',
          ],
        },
      ],
      actions: [
        { label: 'Open Budget', href: '/budget' },
        { label: 'View categories', href: '/budget' },
        { label: 'View recurring expenses', href: '/budget?filter=recurring' },
      ],
      toneNote: 'educational_not_advice',
      disclaimer: 'Educational info only — not financial advice.',
    };
  }

  const recurring = recurringNoEnd[0];

  return {
    title: 'One Habit to Improve',
    summary: `A recurring expense without end date may be draining your budget: ${recurring.description || 'Recurring expense'}.`,
    sections: [
      {
        heading: 'Habit to try this week',
        bullets: [
          'Add an end date to all recurring expenses you review this week.',
          'Schedule one monthly subscription audit reminder.',
        ],
      },
    ],
    actions: [
      { label: 'Open Budget', href: '/budget' },
      { label: 'View recurring expenses', href: '/budget?filter=recurring' },
    ],
    toneNote: 'educational_not_advice',
    disclaimer: 'Educational info only — not financial advice.',
  };
};

const getPortfolioValueForType = (insightContext, accountType) =>
  (insightContext.holdingsAllocations ?? [])
    .filter((holding) => holding.accountType === accountType)
    .reduce((total, holding) => total + Number(holding.marketValue || 0), 0);

const buildNetWorthSnapshot = (insightContext) => {
  const currency = insightContext.profile.baseCurrency ?? 'RON';
  const budgetBalance = Number(insightContext.budget.incomeTotal || 0) - Number(insightContext.budget.expenseTotal || 0);
  const cryptoPortfolioValue = getPortfolioValueForType(insightContext, 'crypto');
  const stocksPortfolioValue = getPortfolioValueForType(insightContext, 'stocks');
  const cryptoCash = Number(insightContext.investing.crypto.buyingPower || 0);
  const stocksCash = Number(insightContext.investing.stocks.buyingPower || 0);
  const netWorthEstimate = budgetBalance + cryptoPortfolioValue + cryptoCash + stocksPortfolioValue + stocksCash;

  return {
    currency,
    budgetBalance,
    cryptoPortfolioValue,
    stocksPortfolioValue,
    cryptoCash,
    stocksCash,
    netWorthEstimate,
  };
};

const buildSavingTipsCard = ({ insightContext }) => {
  const currency = insightContext.profile.baseCurrency ?? 'RON';
  const budget = insightContext.budget ?? {};
  const recurringNoEnd = (insightContext.recurringTransactions ?? [])
    .filter((transaction) => transaction.type === 'expense' && transaction.isRecurring && transaction.recurrenceEndDate === null)
    .slice(0, 3);

  const quickWinsBullets = [
    `Track fixed vs variable spending weekly so you can spot leaks early (${formatCurrency(budget.expenseTotal, currency)} spent this month).`,
    'Set one spending cap for non-essential categories before the next paycheck.',
    'Use a 24-hour pause for impulse purchases over your usual daily spend.',
  ];

  const recurringBullets = recurringNoEnd.length > 0
    ? recurringNoEnd.map((transaction) => (
        `${transaction.description || 'Recurring expense'}: ${formatCurrency(transaction.amount, transaction.currency || currency)} (no end date set)`
      ))
    : ['No recurring expenses without end date found in your recent data.'];

  const overBudget = Number(budget.expenseToDate || 0) > Number(budget.budgetGoal || 0);
  const nextHabitSuggestion = overBudget
    ? 'Schedule a 10-minute weekly “expense cleanup” to pause one non-essential subscription or category.'
    : 'Automate a small transfer to savings right after income arrives to lock in consistency.';

  const hasRecurringNoEnd = recurringNoEnd.length > 0;
  const recurringActionHref = hasRecurringNoEnd
    ? `/budget?openEditTx=${recurringNoEnd[0].id}`
    : '/budget?filter=recurring';

  return {
    title: 'Saving Tips',
    summary: `Here are practical saving steps based on your current budget activity (${budget.monthKey ?? 'this month'}).`,
    sections: [
      {
        heading: 'Quick wins',
        bullets: quickWinsBullets,
      },
      {
        heading: 'Subscriptions & recurring',
        bullets: recurringBullets,
      },
      {
        heading: 'Next best habit this week',
        bullets: [nextHabitSuggestion],
      },
    ],
    actions: [
      { label: 'Open Budget', href: '/budget' },
      { label: 'View recurring expenses', href: recurringActionHref },
    ],
    toneNote: 'educational_not_advice',
    disclaimer: 'Educational info only — not financial advice.',
  };
};

const buildNetWorthCard = ({ insightContext }) => {
  const snapshot = buildNetWorthSnapshot(insightContext);
  const currency = snapshot.currency;

  return {
    title: 'Net Worth Snapshot',
    summary: `Net worth = assets minus liabilities. Current tracked estimate: ${formatCurrency(snapshot.netWorthEstimate, currency)}.`,
    sections: [
      {
        heading: 'What is net worth?',
        content:
          'Net worth is the value of what you own minus what you owe. It is a progress metric, not a buy/sell signal.',
      },
      {
        heading: 'How FinVision calculates it',
        bullets: [
          `Budget balance proxy (income - expenses this month): ${formatCurrency(snapshot.budgetBalance, currency)}`,
          `Crypto portfolio value: ${formatCurrency(snapshot.cryptoPortfolioValue, currency)} + cash ${formatCurrency(snapshot.cryptoCash, currency)}`,
          `Stocks portfolio value: ${formatCurrency(snapshot.stocksPortfolioValue, currency)} + cash ${formatCurrency(snapshot.stocksCash, currency)}`,
          'Liabilities are not tracked yet in FinVision.',
        ],
      },
      {
        heading: 'What to do next',
        bullets: [
          'Review this snapshot monthly so trend direction matters more than one-day changes.',
          'Increase consistency: grow savings rate first, then diversify over time.',
        ],
      },
    ],
    actions: [
      { label: 'Open Home', href: '/home' },
      { label: 'Open Invest', href: '/invest' },
      { label: 'Open Market', href: '/market' },
    ],
    toneNote: 'educational_not_advice',
    disclaimer: 'Educational info only — not financial advice.',
  };
};

const LOCALE_TO_LANGUAGE = {
  'ro-RO': 'Romanian',
  'en-US': 'English',
};

const buildSystemInstruction = ({ contextTypeUsed, shouldAllowSpendingPatterns, hasInsights, intent, locale }) => {
  const preferredLanguage = LOCALE_TO_LANGUAGE[locale] ?? null;
  const lines = [
    'You are Finny, a finance + FinVision assistant. Refuse out-of-scope topics.',
    'Provide educational guidance only, not financial advice.',
    'Never provide buy/sell recommendations or direct investment actions.',
    'Answer the user question first and do not change the topic.',
    preferredLanguage
      ? `Reply in the same language as the user's message. If that is unclear, default to ${preferredLanguage}. Write all card text (title, summary, headings, bullets, action labels, disclaimer) in that language.`
      : "Reply in the same language as the user's message. Write all card text in that language.",
    'Allowed topics: budgeting, savings, net worth, personal finance education, crypto/stocks education, FinVision app usage, and finance/news explanations related to these areas.',
    'Budget analysis requests can include spending categories, monthly pacing, and habit improvement using the provided data.',
    'If user asks unrelated topics, respond with a refusal and offer finance/app alternatives.',
    'Keep responses concise and chat-friendly. Use short paragraphs or bullets.',
    'For allowed topics return ONLY valid JSON. No markdown. No extra keys.',
    'Use this exact schema: {"title":"","summary":"","sections":[{"heading":"","bullets":[""]}],"actions":[{"label":"","href":""}],"toneNote":"educational_not_advice","disclaimer":"Educational info only — not financial advice."}',
    'For JSON actions, use keys label and href only.',
    'Set toneNote to educational_not_advice when returning JSON.',
    'Do not invent numbers. Use context values if present; otherwise say not available yet.',
  ];

  if (shouldAllowSpendingPatterns) {
    lines.push('Budget or subscription patterns are relevant for this request. Use provided context when useful.');
  } else {
    lines.push('Do not mention subscription or budget warnings unless asked.');
  }

  if (hasInsights) {
    lines.push('When insights are present, prioritize explaining the most relevant insight clearly and practically.');
  }

  if (contextTypeUsed === 'app') {
    lines.push('Focus on FinVision app functionality, where to click, and navigation shortcuts.');
  }

  if (contextTypeUsed === 'crypto') {
    lines.push('Focus on neutral crypto education and comparisons, not portfolio advice.');
    lines.push('When crypto quote fields are present, use them first. If priceSource is avg_cost_estimate, label it as an estimate.');
  }

  if (contextTypeUsed === 'stocks') {
    lines.push('Focus on neutral stock market education, not trade instructions.');
  }

  if (intent === 'SAVING_TIPS') {
    lines.push('Prioritize practical saving habits for current month cash flow and spending control.');
  }

  if (intent === 'NET_WORTH') {
    lines.push('Explain net worth clearly and how FinVision computes it from available components.');
  }

  return lines.join('\n');
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const tryParseJsonObject = (rawOutput) => {
  if (typeof rawOutput !== 'string' || rawOutput.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawOutput);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeCardSections = (sections) => {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections.reduce((accumulator, section) => {
    if (!isPlainObject(section)) {
      return accumulator;
    }

    const heading = typeof section.heading === 'string'
      ? section.heading.trim()
      : typeof section.title === 'string'
        ? section.title.trim()
        : '';
    const content = typeof section.content === 'string'
      ? section.content.trim()
      : typeof section.text === 'string'
        ? section.text.trim()
        : '';
    const bullets = Array.isArray(section.bullets)
      ? section.bullets.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];

    if (!heading && !content && bullets.length === 0) {
      return accumulator;
    }

    accumulator.push({
      heading: heading || 'Section',
      ...(content ? { content } : {}),
      ...(bullets.length > 0 ? { bullets } : {}),
    });

    return accumulator;
  }, []);
};

const normalizeCardActions = (actions) => {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.reduce((accumulator, action) => {
    if (!isPlainObject(action)) {
      return accumulator;
    }

    const label = typeof action.label === 'string' ? action.label.trim() : '';
    const href = typeof action.href === 'string' ? action.href.trim() : '';

    if (!label || !href) {
      return accumulator;
    }

    accumulator.push({ label, href });
    return accumulator;
  }, []);
};

const normalizeCardPayload = (parsedObject) => {
  if (!isPlainObject(parsedObject)) {
    return null;
  }

  const title = typeof parsedObject.title === 'string' ? parsedObject.title.trim() : '';
  const summary = typeof parsedObject.summary === 'string' ? parsedObject.summary.trim() : '';
  const sections = normalizeCardSections(parsedObject.sections);
  const actions = normalizeCardActions(parsedObject.actions);
  const toneNote = typeof parsedObject.toneNote === 'string' ? parsedObject.toneNote.trim() : '';
  const disclaimer = typeof parsedObject.disclaimer === 'string' ? parsedObject.disclaimer.trim() : '';

  if (!title && !summary && sections.length === 0 && actions.length === 0 && !disclaimer) {
    return null;
  }

  return {
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(sections.length > 0 ? { sections } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(toneNote ? { toneNote } : {}),
    ...(disclaimer ? { disclaimer } : {}),
  };
};

const looksLikeJsonString = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    || trimmed.includes('"title"')
    || trimmed.includes('"sections"')
    || trimmed.includes('"actions"')
  );
};

const toTextResponse = (rawOutput) => {
  if (typeof rawOutput !== 'string' || rawOutput.trim().length === 0) {
    return 'Finny could not generate a readable response. Please try again.';
  }

  const trimmed = rawOutput.trim();

  if (looksLikeJsonString(trimmed)) {
    return 'Finny prepared a structured answer but formatting failed. Please try again.';
  }

  return trimmed;
};

const shouldReturnInsightCard = ({ message, contextTypeUsed, intent }) => {
  const normalizedMessage = String(message ?? '').trim().toLowerCase();

  if (intent === 'SUBSCRIPTIONS_REVIEW' || contextTypeUsed === 'subscriptions') {
    return true;
  }

  if (includesAnyKeyword(normalizedMessage, ANALYSIS_KEYWORDS)) {
    return true;
  }

  return false;
};

const getInsightIcon = (insightType) => {
  if (insightType === 'SUBSCRIPTION_NO_END') {
    return 'subscription';
  }

  if (insightType === 'BUDGET_PACE_WARNING') {
    return 'budget';
  }

  return 'invest';
};

const buildInsightCardFromInsight = (insight) => ({
  icon: getInsightIcon(insight.type),
  title: insight.title,
  subtitle: insight.whatNoticed,
  blocks: [
    {
      heading: 'WHAT I NOTICED',
      text: insight.whatNoticed,
    },
    {
      heading: 'WHY IT MATTERS',
      text: insight.whyMatters,
    },
    {
      heading: 'WHAT YOU CAN DO',
      text: insight.whatYouCanDo,
    },
  ],
  actions: Array.isArray(insight.actions)
    ? insight.actions.map((action) => ({
        label: action.label,
        href: action.href,
        variant: action.variant,
      }))
    : [],
});

const pickBestInsight = ({ insights, contextTypeUsed }) => {
  if (!Array.isArray(insights) || insights.length === 0) {
    return null;
  }

  const preferredTypes = INSIGHT_TYPES_BY_CONTEXT[contextTypeUsed] ?? INSIGHT_TYPES_BY_CONTEXT.general;

  return [...insights].sort((left, right) => {
    const leftTypeRank = preferredTypes.includes(left.type)
      ? preferredTypes.indexOf(left.type)
      : preferredTypes.length + 1;
    const rightTypeRank = preferredTypes.includes(right.type)
      ? preferredTypes.indexOf(right.type)
      : preferredTypes.length + 1;

    if (leftTypeRank !== rightTypeRank) {
      return leftTypeRank - rightTypeRank;
    }

    const severityDelta = severityRankForInsight(right.severity) - severityRankForInsight(left.severity);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return new Date(right.updatedAt || right.createdAt || 0).getTime()
      - new Date(left.updatedAt || left.createdAt || 0).getTime();
  })[0] ?? null;
};

const buildGeminiContextByType = ({ insightContext, contextTypeUsed, shouldAllowSpendingPatterns, insights }) => {
  const netWorthSnapshot = buildNetWorthSnapshot(insightContext);
  const recurringWithoutEndDate = (insightContext.recurringTransactions ?? [])
    .filter((transaction) => transaction.type === 'expense' && transaction.isRecurring && transaction.recurrenceEndDate === null)
    .slice(0, 3);

  const context = {
    profile: {
      locale: insightContext.profile.locale,
      baseCurrency: insightContext.profile.baseCurrency,
      monthlyBudgetGoal: insightContext.profile.monthlyBudgetGoal,
    },
    financialSnapshot: {
      budgetSummary: {
        monthKey: insightContext.budget.monthKey,
        incomeTotal: insightContext.budget.incomeTotal,
        expenseTotal: insightContext.budget.expenseTotal,
        remainingBudget: insightContext.budget.remainingBudget,
      },
      recurringWithoutEndDate,
      investing: {
        cryptoPortfolioValue: Number(netWorthSnapshot.cryptoPortfolioValue.toFixed(2)),
        cryptoCash: Number(netWorthSnapshot.cryptoCash.toFixed(2)),
        stocksPortfolioValue: Number(netWorthSnapshot.stocksPortfolioValue.toFixed(2)),
        stocksCash: Number(netWorthSnapshot.stocksCash.toFixed(2)),
      },
    },
  };
  const attachedContextFields = ['profile', 'financialSnapshot'];

  if (contextTypeUsed === 'app') {
    context.appHints = [
      { feature: 'Budget', href: '/budget', note: 'Track monthly spending and recurring expenses.' },
      { feature: 'Market', href: '/market', note: 'Explore stocks and crypto educational views.' },
      { feature: 'Invest', href: '/invest', note: 'Manage funded or demo investing flows.' },
    ];
    attachedContextFields.push('appHints');
  }

  if (contextTypeUsed === 'budget') {
    context.budgetSummary = insightContext.budget;
    context.recentTransactions = insightContext.recentTransactions;
    attachedContextFields.push('budgetSummary', 'recentTransactions');
  }

  if (contextTypeUsed === 'subscriptions') {
    context.recurringTransactions = insightContext.recurringTransactions;
    context.recurringWithoutEndDate = insightContext.recurringTransactions.filter(
      (transaction) => transaction.recurrenceEndDate === null,
    );
    attachedContextFields.push('recurringTransactions', 'recurringWithoutEndDate');
  }

  if (contextTypeUsed === 'crypto' || contextTypeUsed === 'stocks') {
    const holdings = insightContext.holdingsAllocations.filter((holding) => (
      contextTypeUsed === 'crypto' ? holding.accountType === 'crypto' : holding.accountType === 'stocks'
    ));

    context.investing = {
      [contextTypeUsed]: insightContext.investing[contextTypeUsed],
    };
    context.holdingsAllocations = holdings;

    attachedContextFields.push('investing', 'holdingsAllocations');

    if (contextTypeUsed === 'crypto') {
      context.cryptoQuotes = Array.isArray(insightContext.marketData?.cryptoQuotes)
        ? insightContext.marketData.cryptoQuotes.slice(0, 10)
        : [];
      attachedContextFields.push('cryptoQuotes');
    }
  }

  if (shouldAllowSpendingPatterns || contextTypeUsed === 'crypto' || contextTypeUsed === 'stocks') {
    context.insights = insights.slice(0, 5);
    attachedContextFields.push('insights');
  }

  return { context, attachedContextFields };
};

const router = express.Router();

router.post('/chat', requireAuth, validateRequest({ body: finnyChatSchema }), async (req, res, next) => {
  const userId = req.authUser._id.toString();
  let contextTypeUsed = 'general';

  try {
    if (!consumeUserRateLimit(userId)) {
      throw new AppError({
        message: 'Finny is busy, try again shortly.',
        statusCode: 429,
        code: 'FINNY_RATE_LIMIT',
        details: [{ reason: 'USER_RATE_LIMIT_EXCEEDED', max: USER_MAX_REQUESTS_PER_WINDOW, windowMs: USER_WINDOW_MS }],
      });
    }

    const { message, contextType, selectedMonth } = req.body;
    const topicScope = inspectTopicScope(message);
    const intentInspection = inspectIntent(message);
    const intent = INTENT_VALUES.includes(intentInspection.intent)
      ? intentInspection.intent
      : 'OFF_TOPIC';

    if (!topicScope.inScope || intent === 'OFF_TOPIC') {
      sendSuccess(res, {
        format: 'text',
        role: 'assistant',
        content: FINNY_OUT_OF_SCOPE_TEXT,
        text: FINNY_OUT_OF_SCOPE_TEXT,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: false,
                matchedKeywords: topicScope.matchedKeywords,
                intent,
                matchedIntentKeywords: intentInspection.matchedIntentKeywords,
              },
            }
          : {}),
      });
      return;
    }

    contextTypeUsed = resolveContextType(contextType, intent, message);

    const insightContext = await buildInsightContext({
      authUser: req.authUser,
      selectedMonth,
    });

    const insightDocs = await generateInsights({
      userId: req.authUser._id,
      context: insightContext,
      limit: 10,
    });
    const insights = insightDocs.map((insight) => serializeInsight(insight));

    const shouldAllowSpendingPatterns =
      contextTypeUsed === 'budget'
      || contextTypeUsed === 'subscriptions'
      || intent === 'BUDGET_CHECK'
      || intent === 'TOP_SPENDING_CATEGORIES'
      || intent === 'HABIT_IMPROVEMENT_30D'
      || intent === 'SUBSCRIPTIONS_REVIEW'
      || intent === 'SAVING_TIPS';

    const recurringNoEnd = (insightContext.recurringTransactions ?? [])
      .filter((transaction) => transaction.type === 'expense' && transaction.isRecurring && transaction.recurrenceEndDate === null)
      .slice(0, 3);

    if (intent === 'BUDGET_CHECK') {
      const card = buildBudgetOverviewCard({
        insightContext,
        recurringNoEnd,
      });

      sendSuccess(res, {
        format: 'card',
        card,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: topicScope.inScope,
                matchedKeywords: topicScope.matchedKeywords,
                matchedIntentKeywords: intentInspection.matchedIntentKeywords,
                contextTypeUsed,
                intent,
                selectedInsightType: null,
              },
            }
          : {}),
      });
      return;
    }

    if (intent === 'TOP_SPENDING_CATEGORIES') {
      const monthBounds = getMonthBoundsUtc(selectedMonth ?? insightContext.budget?.monthKey);
      const categoryTotals = await computeCategoryTotals({
        userId: req.authUser._id,
        startDate: monthBounds.monthStart,
        endDate: monthBounds.monthEnd,
      });

      const topCategories = [...categoryTotals.totals]
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 3)
        .map((item) => ({
          ...item,
          sharePct: categoryTotals.totalExpense > 0 ? (item.amount / categoryTotals.totalExpense) * 100 : 0,
        }));

      const card = buildTopSpendingCategoriesCard({
        monthKey: monthBounds.monthKey,
        topCategories,
        totalExpense: categoryTotals.totalExpense,
        currency: insightContext.profile.baseCurrency ?? 'RON',
      });

      sendSuccess(res, {
        format: 'card',
        card,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: topicScope.inScope,
                matchedKeywords: topicScope.matchedKeywords,
                matchedIntentKeywords: intentInspection.matchedIntentKeywords,
                contextTypeUsed,
                intent,
                selectedInsightType: null,
              },
            }
          : {}),
      });
      return;
    }

    if (intent === 'HABIT_IMPROVEMENT_30D') {
      const last30Range = getLastDaysRange(30);
      const previous30End = last30Range.start;
      const previous30Start = new Date(previous30End.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [last30Totals, previous30Totals] = await Promise.all([
        computeCategoryTotals({
          userId: req.authUser._id,
          startDate: last30Range.start,
          endDate: last30Range.end,
        }),
        computeCategoryTotals({
          userId: req.authUser._id,
          startDate: previous30Start,
          endDate: previous30End,
        }),
      ]);

      const topLast30 = [...last30Totals.totals].sort((left, right) => right.amount - left.amount)[0] ?? null;
      const previousCategoryAmount = topLast30
        ? (previous30Totals.totals.find((item) => item.categoryId === topLast30.categoryId)?.amount ?? 0)
        : 0;

      const card = buildHabitImprovementCard({
        insightContext,
        topLast30,
        previousCategoryAmount,
        recurringNoEnd,
      });

      sendSuccess(res, {
        format: 'card',
        card,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: topicScope.inScope,
                matchedKeywords: topicScope.matchedKeywords,
                matchedIntentKeywords: intentInspection.matchedIntentKeywords,
                contextTypeUsed,
                intent,
                selectedInsightType: null,
              },
            }
          : {}),
      });
      return;
    }

    if (intent === 'SAVING_TIPS') {
      const card = buildSavingTipsCard({ insightContext });

      sendSuccess(res, {
        format: 'card',
        card,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: topicScope.inScope,
                matchedKeywords: topicScope.matchedKeywords,
                matchedIntentKeywords: intentInspection.matchedIntentKeywords,
                contextTypeUsed,
                intent,
                selectedInsightType: null,
              },
            }
          : {}),
      });
      return;
    }

    if (intent === 'NET_WORTH') {
      const card = buildNetWorthCard({ insightContext });

      sendSuccess(res, {
        format: 'card',
        card,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: topicScope.inScope,
                matchedKeywords: topicScope.matchedKeywords,
                matchedIntentKeywords: intentInspection.matchedIntentKeywords,
                contextTypeUsed,
                intent,
                selectedInsightType: null,
              },
            }
          : {}),
      });
      return;
    }

    const shouldShowInsightCard = shouldReturnInsightCard({ message, contextTypeUsed, intent });

    if (shouldShowInsightCard) {
      const bestInsight = pickBestInsight({
        insights,
        contextTypeUsed,
      });

      if (bestInsight) {
        sendSuccess(res, {
          format: 'insight_card',
          card: buildInsightCardFromInsight(bestInsight),
          ...(SHOULD_INCLUDE_DEBUG_META
            ? {
                meta: {
                  inScope: topicScope.inScope,
                  matchedKeywords: topicScope.matchedKeywords,
                  matchedIntentKeywords: intentInspection.matchedIntentKeywords,
                  contextTypeUsed,
                  intent,
                  selectedInsightType: bestInsight.type,
                },
              }
            : {}),
        });
        return;
      }
    }

    const { context, attachedContextFields } = buildGeminiContextByType({
      insightContext,
      contextTypeUsed,
      shouldAllowSpendingPatterns,
      insights,
    });

    let reply;

    try {
      reply = await generateFinnyReply({
        message,
        systemInstruction: buildSystemInstruction({
          contextTypeUsed,
          shouldAllowSpendingPatterns,
          hasInsights: insights.length > 0,
          intent,
          locale: insightContext.profile?.locale,
        }),
        context,
      });
    } catch {
      sendSuccess(res, {
        format: 'text',
        text: FINNY_PROVIDER_UNAVAILABLE_TEXT,
        ...(SHOULD_INCLUDE_DEBUG_META
          ? {
              meta: {
                inScope: topicScope.inScope,
                contextTypeUsed,
                intent,
                providerError: true,
              },
            }
          : {}),
      });
      return;
    }

    const parsedObject = tryParseJsonObject(reply);
    const normalizedCard = normalizeCardPayload(parsedObject);
    const meta = SHOULD_INCLUDE_DEBUG_META
      ? {
          inScope: topicScope.inScope,
          matchedKeywords: topicScope.matchedKeywords,
          matchedIntentKeywords: intentInspection.matchedIntentKeywords,
          contextTypeUsed,
          intent,
          attachedContextFields,
          activeInsightCount: insights.length,
        }
      : undefined;

    if (normalizedCard) {
      sendSuccess(res, {
        format: 'card',
        card: normalizedCard,
        ...(meta ? { meta } : {}),
      });
      return;
    }

    sendSuccess(res, {
      format: 'text',
      text: toTextResponse(reply),
      ...(meta ? { meta } : {}),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
