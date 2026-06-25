const ALLOWLIST_KEYWORDS = [
  'finance',
  'personal finance',
  'budget',
  'budgeting',
  'check my budget',
  'budget this month',
  'am i on track',
  'track expenses',
  'spending',
  'spending categories',
  'top categories',
  'top 3 spending categories',
  'where did i spend most',
  'expense',
  'expenses',
  'income',
  'cash flow',
  'saving',
  'savings',
  'save money',
  'saving tips',
  'reduce expenses',
  'cut spending',
  'emergency fund',
  'net worth',
  'wealth',
  'assets',
  'liabilities',
  'portfolio value',
  'balance sheet',
  'goal',
  'goals',
  'saving goal',
  'habit',
  'improve habit',
  'last 30 days',
  'suggest one habit',
  'loan',
  'debt',
  'apr',
  'snowball',
  'avalanche',
  'interest',
  'compound interest',
  'invest',
  'investing',
  'investment',
  'investments',
  'etf',
  'stock',
  'stocks',
  'bond',
  'dividend',
  'crypto',
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'portfolio',
  'trade',
  'trading',
  'market',
  'candles',
  'subscription',
  'subscriptions',
  'recurring',
  'category',
  'budget goal',
  'investing account',
  'demo portfolio',
  'finvision',
  'economi',
  'buget',
  'cheltui',
  'unde am cheltuit',
  'venit',
  'datori',
  'dobanda',
  'dobând',
  'actiuni',
  'acțiuni',
  'obligatiuni',
  'obligațiuni',
  'cripto',
  'portofoliu',
  'piata',
  'piaț',
  'piață',
  'avere',
  'patrimoniu',
  'abonament',
  'obicei',
  'fond de urgenta',
  'fond de urgență',
];

const BLOCKLIST_KEYWORDS = [
  'football',
  'soccer',
  'fc barcelona',
  'barcelona',
  'striker',
  'coach',
  'player',
  'match',
  'goalkeeper',
  'premier league',
  'champions league',
  'nba',
  'nfl',
  'baseball',
  'cricket',
  'tennis',
  'politics',
  'election',
  'president',
  'prime minister',
  'celebrity',
  'movie',
  'lyrics',
  'recipe',
  'weather',
  'general trivia',
];

const normalize = (message) => String(message ?? '').trim().toLowerCase();

const getMatchedKeywords = (text, keywords) =>
  keywords.filter((keyword) => text.includes(keyword));

const includesAnyKeyword = (text, keywords) => keywords.some((keyword) => text.includes(keyword));

const INTENT_KEYWORDS = {
  SUBSCRIPTIONS_REVIEW: [
    'subscription',
    'subscriptions',
    'recurring',
    'renewal',
    'netflix',
    'spotify',
    'hbo',
    'prime',
    'abonament',
  ],
  NET_WORTH: [
    'net worth',
    'wealth',
    'assets',
    'liabilities',
    'portfolio value',
    'balance sheet',
    'avere',
    'patrimoniu',
  ],
  SAVING_TIPS: [
    'saving tips',
    'save money',
    'saving',
    'savings',
    'reduce',
    'reduce expenses',
    'monthly expenses',
    'cut spending',
    'spend less',
    'emergency fund',
    'cash flow',
    'economi',
    'fond de urgenta',
    'fond de urgență',
  ],
  BUDGET_CHECK: [
    'budget',
    'budgeting',
    'expense',
    'expenses',
    'track expenses',
    'am i on track',
    'check my budget',
    'budget this month',
    'income vs expenses',
    'budget goal',
    'monthly budget',
    'buget',
    'cheltui',
    'venit',
  ],
  TOP_SPENDING_CATEGORIES: [
    'top categories',
    'top 3 spending categories',
    'spending categories',
    'where did i spend most',
    'highest spending category',
    'largest category',
    'unde am cheltuit',
    'pe ce am cheltuit',
    'top cheltuieli',
    'categorii',
  ],
  HABIT_IMPROVEMENT_30D: [
    'habit',
    'improve based on',
    'last 30 days',
    'suggest one habit',
    'one habit i can improve',
    'obicei',
    'ultimele 30',
  ],
  APP_USAGE: ['finvision', 'app', 'feature', 'navigate', 'where is', 'how do i', 'settings', 'dashboard'],
  FINANCE_EDUCATION: [
    'finance',
    'personal finance',
    'etf',
    'bond',
    'stock',
    'stocks',
    'crypto',
    'bitcoin',
    'ethereum',
    'compound interest',
    'loan',
    'debt',
    'apr',
    'snowball',
    'avalanche',
    'invest',
    'investing',
    'market',
    'dobanda',
    'dobând',
    'actiuni',
    'acțiuni',
    'obligatiuni',
    'obligațiuni',
    'cripto',
    'portofoliu',
    'piata',
    'piaț',
    'piață',
    'datori',
  ],
};

const INTENT_PRIORITY = [
  'SUBSCRIPTIONS_REVIEW',
  'NET_WORTH',
  'TOP_SPENDING_CATEGORIES',
  'HABIT_IMPROVEMENT_30D',
  'SAVING_TIPS',
  'BUDGET_CHECK',
  'APP_USAGE',
  'FINANCE_EDUCATION',
];

export const inspectTopicScope = (message) => {
  const normalized = normalize(message);

  if (!normalized) {
    return {
      inScope: false,
      matchedAllowKeywords: [],
      matchedBlockKeywords: [],
      matchedKeywords: [],
    };
  }

  const matchedAllowKeywords = getMatchedKeywords(normalized, ALLOWLIST_KEYWORDS);
  const matchedBlockKeywords = getMatchedKeywords(normalized, BLOCKLIST_KEYWORDS);

  const inScope = matchedAllowKeywords.length > 0 && matchedBlockKeywords.length === 0;

  return {
    inScope,
    matchedAllowKeywords,
    matchedBlockKeywords,
    matchedKeywords: [...new Set([...matchedAllowKeywords, ...matchedBlockKeywords])],
  };
};

export const isInScope = (message) => inspectTopicScope(message).inScope;

export const inspectIntent = (message) => {
  const normalized = normalize(message);
  const scope = inspectTopicScope(normalized);

  if (!scope.inScope) {
    return {
      intent: 'OFF_TOPIC',
      matchedIntentKeywords: [],
      matchedAllowKeywords: scope.matchedAllowKeywords,
      matchedBlockKeywords: scope.matchedBlockKeywords,
    };
  }

  for (const intent of INTENT_PRIORITY) {
    const keywords = INTENT_KEYWORDS[intent] ?? [];
    const matchedIntentKeywords = getMatchedKeywords(normalized, keywords);

    if (matchedIntentKeywords.length > 0) {
      return {
        intent,
        matchedIntentKeywords,
        matchedAllowKeywords: scope.matchedAllowKeywords,
        matchedBlockKeywords: scope.matchedBlockKeywords,
      };
    }
  }

  if (includesAnyKeyword(normalized, ALLOWLIST_KEYWORDS)) {
    return {
      intent: 'FINANCE_EDUCATION',
      matchedIntentKeywords: [],
      matchedAllowKeywords: scope.matchedAllowKeywords,
      matchedBlockKeywords: scope.matchedBlockKeywords,
    };
  }

  return {
    intent: 'OFF_TOPIC',
    matchedIntentKeywords: [],
    matchedAllowKeywords: scope.matchedAllowKeywords,
    matchedBlockKeywords: scope.matchedBlockKeywords,
  };
};

export const classifyIntent = (message) => inspectIntent(message).intent;
