const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5001';
const AUTH_TOKEN_STORAGE_KEYS = [
  'finvision.accessToken',
  'accessToken',
] as const;
const REFRESH_TOKEN_STORAGE_KEY = 'finvision.refreshToken';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  baseCurrency: 'RON' | 'EUR' | 'USD';
  locale: 'en-US' | 'ro-RO';
  avatarUrl: string;
  plan: 'free';
  monthlyBudgetGoal: number | null;
  investingMonthlyContributionGoal: number;
  investCryptoMode: 'funded' | 'demo' | null;
  marketStocksMode: 'funded' | 'demo' | null;
};

export type BudgetCategory = {
  id: string;
  name: string;
  slug: string;
  color: string;
  kind: 'income' | 'expense' | 'both';
  type?: 'income' | 'expense' | 'both';
};

export type BudgetTransaction = {
  id: string;
  originalTransactionId: string;
  sourceDate: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  occurrenceDate: string;
  description: string;
  createdAt: string;
  isRecurring: boolean;
  recurrence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
  recurrenceEndDate: string | null;
  nextOccurrenceAt: string | null;
  isProjected: boolean;
  category: BudgetCategory | null;
};

export type BudgetSummary = {
  monthStart: string;
  monthEnd: string;
  currency: 'RON' | 'EUR' | 'USD';
  budgetGoal: number | null;
  incomeTotal: number;
  expenseTotal: number;
  remainingBudget: number | null;
};

export type EducationContentBlock = {
  type: 'paragraph' | 'callout' | 'bulletList';
  text?: string | null;
  items?: string[];
};

export type EducationArticleSummary = {
  id: string;
  title: string;
  slug: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  excerpt: string;
  estimatedMinutes: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type EducationArticleDetail = EducationArticleSummary & {
  contentBlocks: EducationContentBlock[];
};

export type EducationQuizSummary = {
  id: string;
  title: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  passingScore: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EducationQuizQuestionOption = {
  id: string;
  text: string;
};

export type EducationQuizQuestion = {
  id: string;
  prompt: string;
  options: EducationQuizQuestionOption[];
  order: number;
};

export type EducationQuizDetail = EducationQuizSummary & {
  questions: EducationQuizQuestion[];
};

export type EducationQuizAttemptFeedback = {
  questionId: string;
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string;
};

export type EducationQuizAttemptResult = {
  attemptId: string;
  score: number;
  passed: boolean;
  feedback: EducationQuizAttemptFeedback[];
  recommendedNext: {
    type: 'quiz';
    id: string;
    title: string;
    category: string;
  } | null;
};

export type EducationProgress = {
  xp: number;
  level: number;
  streakDays: number;
  lastActiveAt: string | null;
  completedArticlesCount: number;
  quizAccuracyPct: number;
  recentAttempts: {
    id: string;
    quizId: string | null;
    quizTitle: string;
    category: string;
    score: number;
    passed: boolean;
    createdAt: string;
  }[];
};

export type NewsTopic = 'all' | 'budgeting' | 'investing' | 'crypto' | 'macro';

export type NewsArticle = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  snippet: string;
};

export type Insight = {
  id: string;
  userId: string;
  type: 'SUBSCRIPTION_NO_END' | 'BUDGET_PACE_WARNING' | 'INVESTING_UNFUNDED' | 'PORTFOLIO_CONCENTRATION';
  severity: 'low' | 'medium' | 'high';
  title: string;
  whatNoticed: string;
  whyMatters: string;
  whatYouCanDo: string;
  actions: {
    label: string;
    href: string;
    variant: 'primary' | 'secondary' | 'link';
  }[];
  related: {
    transactionId: string | null;
    holdingSymbol: string | null;
    month: string | null;
    categoryId: string | null;
  };
  status: 'active' | 'dismissed';
  createdAt: string | null;
  updatedAt: string | null;
  message?: string;
  relatedTransactionId?: string | null;
  isActive?: boolean;
};

export type FinnyCardSection = {
  heading?: string;
  title?: string;
  content?: string;
  text?: string;
  bullets?: string[];
};

export type FinnyCardAction = {
  label: string;
  href: string;
};

export type FinnyContextType = 'general' | 'budget' | 'subscriptions' | 'crypto' | 'stocks' | 'app';

export type FinnyChatMeta = {
  inScope?: boolean;
  matchedKeywords?: string[];
  contextTypeUsed?: FinnyContextType;
  intent?: FinnyContextType | string;
  attachedContextFields?: string[];
};

export type FinnyCard = {
  title?: string;
  summary?: string;
  sections?: FinnyCardSection[];
  actions?: FinnyCardAction[];
  toneNote?: 'educational_not_advice' | string;
  disclaimer?: string;
};

export type FinnyInsightCardBlock = {
  heading: string;
  text: string;
};

export type FinnyInsightCardAction = {
  label: string;
  href: string;
  variant: 'primary' | 'secondary' | 'link';
};

export type FinnyInsightCard = {
  icon: 'subscription' | 'budget' | 'invest';
  title: string;
  subtitle?: string;
  blocks: FinnyInsightCardBlock[];
  actions: FinnyInsightCardAction[];
};

export type FinnyChatPayloadData =
  | {
      format: 'insight_card';
      card: FinnyInsightCard;
      meta?: FinnyChatMeta;
    }
  | {
      format: 'card';
      card: FinnyCard;
      meta?: FinnyChatMeta;
    }
  | {
      format: 'text';
      text: string;
      meta?: FinnyChatMeta;
    };

export type PortfolioAccount = {
  id: string;
  mode?: InvestCryptoMode;
  cashBalance: number;
  cashBalanceEUR?: number;
  baseCurrency: 'EUR';
  pricingCurrency: 'EUR';
  pricingVs: 'eur';
  pricingNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PortfolioHolding = {
  id: string;
  mode?: InvestCryptoMode;
  assetType: 'crypto' | 'stock';
  coinId: string | null;
  symbol: string;
  quantity: number;
  avgCost: number;
  avgCostEUR?: number;
  currentPrice: number;
  currentPriceEUR?: number;
  change24h: number | null;
  marketValue: number;
  marketValueEUR?: number;
  unrealizedPnL: number;
  allocationPct: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PortfolioTotals = {
  cashBalance: number;
  cashBalanceEUR?: number;
  holdingsValue: number;
  holdingsValueEUR?: number;
  totalValue: number;
  totalValueEUR?: number;
  unrealizedPnL: number;
  holdingsCount: number;
};

export type PortfolioTrade = {
  id: string;
  mode?: InvestCryptoMode;
  assetType: 'crypto' | 'stock';
  coinId: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  priceEUR?: number;
  total: number;
  totalEUR?: number;
  executedPriceOriginal?: number | null;
  originalCurrency?: string | null;
  fxRateToEur?: number | null;
  executedAt?: string | null;
  createdAt: string | null;
};

export type PortfolioSnapshot = {
  id: string;
  mode?: InvestCryptoMode;
  date: string;
  totalValue: number;
  totalValueEUR?: number;
  cashBalance: number;
  cashBalanceEUR?: number;
  holdingsValue: number;
  holdingsValueEUR?: number;
  createdAt: string | null;
};

export type InvestPerformancePoint = {
  t: number;
  value: number;
};

export type InvestCryptoMode = 'funded' | 'demo';
export type MarketStocksMode = 'funded' | 'demo';

export type InvestCryptoState = {
  selectedMode: InvestCryptoMode | null;
  accounts: {
    funded: {
      cashBalanceEUR: number;
      totalValueEUR: number;
      holdingsCount: number;
      tradesCount: number;
    };
    demo: {
      cashBalanceEUR: number;
      totalValueEUR: number;
      holdingsCount: number;
      tradesCount: number;
    };
  };
};

export type MarketStocksState = {
  selectedMode: MarketStocksMode | null;
  accounts: {
    funded: {
      cashBalanceEUR: number;
      totalValueEUR: number;
      holdingsCount: number;
      tradesCount: number;
    };
    demo: {
      cashBalanceEUR: number;
      totalValueEUR: number;
      holdingsCount: number;
      tradesCount: number;
    };
  };
};

export type InvestingWallet = {
  balance: number;
  monthlyGoal: number;
  autoFundEnabled: boolean;
  autoFundAmount: number;
  autoFundDayOfMonth: number;
  investedThisMonthRON: number;
  currency: 'RON';
};

export type InvestingWalletSummary = {
  investedThisMonthRON: number;
  convertedToEurThisMonthRON: number;
  monthStart: string;
  monthEnd: string;
};

export type InvestingWalletConvertQuote = {
  amountRON: number;
  eurAmount: number;
  rate: {
    eurPerRon: number;
    ronPerEur: number | null;
  };
  asText: {
    ronToEur: string;
    eurToRon: string | null;
  };
};

export type InvestingWalletLedgerEntry = {
  id: string;
  type: 'deposit' | 'withdraw' | 'fx_convert_to_eur' | 'autofund';
  amountRON: number;
  meta: Record<string, unknown>;
  createdAt: string | null;
};

export type InvestFundingEntry = {
  id: string;
  mode?: InvestCryptoMode;
  fromCurrency: 'RON';
  fromAmount: number;
  toCurrency: 'EUR';
  toAmount: number;
  rate: number;
  provider: 'frankfurter';
  createdAt: string | null;
};

export type CryptoSearchCoin = {
  coinId: string;
  symbol: string;
  name: string;
  thumb: string;
};

export type CryptoQuote = {
  price: number;
  change24h: number | null;
};

export type CryptoChartPoint = {
  t: number;
  price: number;
};

export type StockSearchResult = {
  symbol: string;
  description: string;
  type: string;
};

export type StockQuote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  prevClose: number | null;
  volume: number | null;
  timestamp: number | null;
};

export type StockCompanyProfile = {
  symbol: string;
  name: string;
  logo: string;
  exchange: string;
  currency: string;
  ipo: string;
  marketCap: number | null;
  weburl: string;
  finnhubIndustry: string;
};

export type StockCandlePoint = {
  t: number;
  c: number;
};

export type InvestStockExecutionQuote = {
  symbol: string;
  priceUSD: number;
  priceEUR: number;
  usdToEurRate: number;
};

export type MarketAllocation = {
  accountType: 'stocks' | 'crypto';
  total: number;
  breakdown: { label: string; value: number; pct: number }[];
  topHoldings: {
    id: string;
    symbol: string;
    value: number;
    pctOfAssets: number;
    pctOfTotal: number;
  }[];
};

export type MarketAccountOverview = {
  cashBalanceEUR: number;
  portfolioValueEUR: number;
  dayPnL: number;
  dayPnLPct: number;
};

export type MarketPerformancePoint = {
  t: number;
  value: number;
};

export type StockChartRange = '1D' | '1W' | '1M' | '6M' | '1Y' | 'ALL';

export type TransactionListMeta = {
  count: number;
  projectedCount: number;
  sort: 'date' | '-date' | 'amount' | '-amount';
  page: number | null;
  limit: number | null;
  total: number;
  totalPages: number | null;
};

type ApiErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  requestId: string;
};

type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  meta?: TransactionListMeta | null;
};

type HealthResponse = ApiSuccessEnvelope<{
  status: string;
}>;

type AuthResponse = ApiSuccessEnvelope<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}>;

type CurrentUserResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type FinnyChatResponse = ApiSuccessEnvelope<
  Partial<{
    format: 'card' | 'text' | 'insight_card';
    card: FinnyCard | FinnyInsightCard;
    insightCard: FinnyInsightCard;
    text: string;
    content: string;
    meta: FinnyChatMeta;
    reply?: string;
    replyTextFallback?: string;
  }>
>;

type LogoutResponse = ApiSuccessEnvelope<{
  loggedOut: boolean;
}>;

type CategoriesResponse = ApiSuccessEnvelope<{
  categories: BudgetCategory[];
}>;

type TransactionsResponse = ApiSuccessEnvelope<{
  transactions: BudgetTransaction[];
}>;

type BudgetSummaryResponse = ApiSuccessEnvelope<BudgetSummary>;

type NewsResponse = {
  success: true;
  data: {
    articles: NewsArticle[];
    page: number;
    limit: number;
  };
  meta?: {
    returned: number;
    totalApprox: number;
    found?: number | null;
    debug?: {
      search?: string;
      providerMeta?: unknown;
    };
    providerStatus?: {
      state: 'ok' | 'timeout' | 'rate_limited' | 'unavailable';
      message: string;
    };
  } | null;
};

type InsightsResponse = ApiSuccessEnvelope<{
  insights: Insight[];
}>;

type DismissInsightResponse = ApiSuccessEnvelope<{
  insight: Insight;
}>;

type EducationArticlesResponse = ApiSuccessEnvelope<{
  articles: EducationArticleSummary[];
}>;

type EducationArticleResponse = ApiSuccessEnvelope<{
  article: EducationArticleDetail;
}>;

type EducationQuizzesResponse = ApiSuccessEnvelope<{
  quizzes: EducationQuizSummary[];
}>;

type EducationQuizResponse = ApiSuccessEnvelope<{
  quiz: EducationQuizDetail;
}>;

type EducationProgressResponse = ApiSuccessEnvelope<{
  progress: EducationProgress;
}>;

type EducationCompleteArticleResponse = ApiSuccessEnvelope<{
  completed: boolean;
  articleId: string;
  progress: EducationProgress;
}>;

type EducationQuizAttemptResponse = ApiSuccessEnvelope<EducationQuizAttemptResult>;

type CreateTransactionResponse = ApiSuccessEnvelope<{
  transaction: BudgetTransaction;
}>;

type InvestAccountResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  account: PortfolioAccount;
}>;

type InvestHoldingsResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  account: PortfolioAccount;
  holdings: PortfolioHolding[];
  totals: PortfolioTotals;
}>;

type InvestTradesResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  trades: PortfolioTrade[];
}>;

type InvestSnapshotsResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  snapshots: PortfolioSnapshot[];
}>;

type MarketAccountResponse = ApiSuccessEnvelope<{
  selectedMode?: MarketStocksMode;
  account: PortfolioAccount;
  totals: PortfolioTotals;
  holdingsCount: number;
  cashBalanceEUR: number;
  portfolioValueEUR: number;
  dayPnL: number;
  dayPnLPct: number;
}>;

type MarketHoldingsResponse = ApiSuccessEnvelope<{
  selectedMode?: MarketStocksMode;
  account: PortfolioAccount;
  holdings: PortfolioHolding[];
  totals: PortfolioTotals;
}>;

type MarketTradesResponse = ApiSuccessEnvelope<{
  selectedMode?: MarketStocksMode;
  trades: PortfolioTrade[];
}>;

type MarketPerformanceResponse = ApiSuccessEnvelope<{
  selectedMode?: MarketStocksMode;
  range: '7d' | '30d';
  series: MarketPerformancePoint[];
  meta: {
    points: number;
    symbols: string[];
  };
}>;

type InvestPerformanceResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  range: '7d' | '30d';
  series: InvestPerformancePoint[];
  meta: {
    points: number;
    coins: string[];
  };
}>;

type InvestFundingResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  funding: InvestFundingEntry[];
}>;


type InvestCryptoStateResponse = ApiSuccessEnvelope<InvestCryptoState>;
type MarketStocksStateResponse = ApiSuccessEnvelope<MarketStocksState>;

type InvestCryptoModeResponse = ApiSuccessEnvelope<{
  selectedMode: InvestCryptoMode;
}>;

type MarketStocksModeResponse = ApiSuccessEnvelope<{
  selectedMode: MarketStocksMode;
}>;

type InvestCryptoDemoBudgetResponse = ApiSuccessEnvelope<{
  selectedMode: InvestCryptoMode | null;
  demoAccount: PortfolioAccount;
  totals: PortfolioTotals;
}>;

type InvestCryptoTopUpFromWalletResponse = ApiSuccessEnvelope<{
  selectedMode: InvestCryptoMode;
  fromAmountRON: number;
  addedEUR: number;
  cashBalanceEUR: number;
  walletBalanceRON: number;
  rate: {
    eurPerRon: number;
    ronPerEur: number | null;
  };
}>;

type InvestingWalletResponse = ApiSuccessEnvelope<InvestingWallet>;

type InvestingWalletSummaryResponse = ApiSuccessEnvelope<InvestingWalletSummary>;

type InvestingWalletLedgerResponse = ApiSuccessEnvelope<{
  entries: InvestingWalletLedgerEntry[];
}>;


type InvestOrderResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  trade: PortfolioTrade;
  account: PortfolioAccount;
  holdingsSummary: PortfolioTotals;
}>;

type InvestStockQuoteResponse = ApiSuccessEnvelope<InvestStockExecutionQuote>;
type MarketAllocationResponse = ApiSuccessEnvelope<{
  allocation: MarketAllocation;
}>;
type MarketTopUpFromWalletResponse = ApiSuccessEnvelope<{
  selectedMode?: MarketStocksMode;
  amountRON: number;
  toppedUpEUR: number;
  walletBalanceRON: number;
  stocksCashBalanceEUR: number;
  rate: {
    eurPerRon: number;
    ronPerEur: number | null;
  };
}>;

type InvestResetResponse = ApiSuccessEnvelope<{
  selectedMode?: InvestCryptoMode;
  account: PortfolioAccount;
  totals: PortfolioTotals;
}>;

type MarketDemoBudgetResponse = ApiSuccessEnvelope<{
  selectedMode: MarketStocksMode | null;
  demoAccount: PortfolioAccount;
  totals: PortfolioTotals;
}>;

type MarketResetResponse = ApiSuccessEnvelope<{
  selectedMode?: MarketStocksMode;
  account: PortfolioAccount;
  totals: PortfolioTotals;
}>;

type MarketAdminResetResponse = ApiSuccessEnvelope<{
  reset: boolean;
  selectedMode: MarketStocksMode | null;
  accounts: {
    funded: PortfolioAccount;
    demo: PortfolioAccount;
  };
}>;

type MarketSearchResponse = ApiSuccessEnvelope<{
  coins: CryptoSearchCoin[];
}>;

type MarketQuoteResponse = ApiSuccessEnvelope<{
  quotes: Record<string, CryptoQuote>;
  requestedVs: 'usd' | 'eur' | 'ron';
  usedVs: 'usd' | 'eur';
  pricingCurrency: 'USD' | 'EUR';
  pricingNote: string | null;
}>;

type MarketChartResponse = ApiSuccessEnvelope<{
  points: CryptoChartPoint[];
  requestedVs: 'usd' | 'eur' | 'ron';
  usedVs: 'usd' | 'eur';
  pricingCurrency: 'USD' | 'EUR';
  pricingNote: string | null;
}>;

type StockSearchResponse = ApiSuccessEnvelope<{
  results: StockSearchResult[];
}>;

type StockQuoteResponse = ApiSuccessEnvelope<{
  quotes: StockQuote[];
}>;

type StockProfileResponse = ApiSuccessEnvelope<{
  profile: StockCompanyProfile;
}>;

type StockCandlesResponse = ApiSuccessEnvelope<{
  series: StockCandlePoint[];
  range: StockChartRange;
  symbol: string;
  meta?: {
    provider?: string | null;
    status?: string | null;
    reason?: string | null;
    finnhubStatus?: string | null;
    requestUrlWithoutToken?: string | null;
    stooqSymbol?: string | null;
  } | null;
}>;

type UpdateBudgetGoalResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type UpdateInvestingProfileResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type UpdateProfileResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type UpdatePasswordResponse = ApiSuccessEnvelope<{
  changed: boolean;
}>;

type RegisterPayload = {
  email: string;
  password: string;
  displayName: string;
  baseCurrency: 'RON' | 'EUR' | 'USD';
};

type LoginPayload = {
  email: string;
  password: string;
};

type FinnyChatPayload = {
  message: string;
  contextType: FinnyContextType;
  selectedMonth?: string;
};

type TransactionsQuery = {
  from: string;
  to: string;
  search?: string;
  categoryId?: string;
  type?: 'income' | 'expense';
  sort?: 'date' | '-date' | 'amount' | '-amount';
  page?: number;
  limit?: number;
};

type CreateTransactionPayload = {
  type: 'income' | 'expense';
  amount: number;
  categoryId: string;
  date: string;
  description?: string;
  isRecurring?: boolean;
  recurrence?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
  recurrenceEndDate?: string | null;
};

type UpdateProfilePayload = {
  displayName?: string;
  email?: string;
  baseCurrency?: 'RON' | 'EUR' | 'USD';
  locale?: 'en-US' | 'ro-RO';
  investCryptoMode?: InvestCryptoMode | null;
  marketStocksMode?: MarketStocksMode | null;
};

type UpdatePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

type NewsQuery = {
  topic?: NewsTopic;
  q?: string;
  page?: number;
  limit?: number;
};

type InvestOrderPayload = {
  coinId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
};

type InvestStockOrderPayload = {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
};


type InvestingWalletUpdatePayload = {
  monthlyGoal?: number;
  autoFundEnabled?: boolean;
  autoFundAmount?: number;
  autoFundDayOfMonth?: number;
};

type InvestingWalletDepositPayload = {
  amountRON: number;
  note?: string;
};

type EducationArticlesQuery = {
  category?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  search?: string;
};

type EducationQuizzesQuery = {
  category?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
};

type EducationQuizAttemptPayload = {
  answers: { questionId: string; selectedOptionId: string }[];
  timeSpentSeconds?: number;
};

type BudgetExportQuery = {
  from: string;
  to: string;
};

type InvestExportQuery = {
  range?: 'all' | 'month';
  year?: number;
  month?: number;
};

type CsvDownloadResult = {
  blob: Blob;
  filename: string;
};

export type ApiFailure = {
  ok: false;
  code: string;
  message: string;
  status: number;
  details: unknown[];
};

export class ApiRequestError extends Error {
  code: string;
  details: unknown[];
  status: number;

  constructor(message: string, options?: { code?: string; details?: unknown[]; status?: number }) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = options?.code ?? 'API_REQUEST_ERROR';
    this.details = options?.details ?? [];
    this.status = options?.status ?? 500;
  }
}

const clearStoredAuthTokens = () => {
  if (typeof window === 'undefined') {
    return;
  }

  for (const key of AUTH_TOKEN_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }

  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};

const handleUnauthorizedResponse = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

  if (refreshToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const payload = (await response.json()) as ApiSuccessEnvelope<{
          accessToken: string;
          refreshToken: string;
        }>;
        window.localStorage.setItem('finvision.accessToken', payload.data.accessToken);
        window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.data.refreshToken);
        window.location.reload();
        return;
      }
    } catch {
    }
  }

  clearStoredAuthTokens();

  const pathname = window.location.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');

  if (!isAuthRoute) {
    window.location.assign('/login');
  }
};

export const toApiFailure = (error: unknown): ApiFailure => {
  if (error instanceof ApiRequestError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  return {
    ok: false,
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error && error.message.trim().length > 0 ? error.message : 'Request failed.',
    status: 500,
    details: [],
  };
};

const apiRequest = async <T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> => {
  const headers = new Headers(options.headers ?? {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === 'AbortError';

    if (isAbortError) {
      throw new ApiRequestError('Request cancelled.', {
        code: 'REQUEST_ABORTED',
        status: 0,
      });
    }

    throw new ApiRequestError('Network request failed.', {
      code: 'NETWORK_ERROR',
      status: 0,
      details: [error instanceof Error ? error.message : 'Unknown network error'],
    });
  }

  const rawPayload = await response.text();
  let payload: unknown = null;

  if (rawPayload.trim()) {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      void handleUnauthorizedResponse();
    }

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'success' in payload &&
      payload.success === false
    ) {
      const errorPayload = payload as ApiErrorEnvelope;

      throw new ApiRequestError(errorPayload.error.message, {
        code: errorPayload.error.code,
        details: errorPayload.error.details,
        status: response.status,
      });
    }

    if (response.status === 429) {
      throw new ApiRequestError('News provider rate-limited. Please retry in a minute.', {
        code: 'RATE_LIMITED',
        status: 429,
      });
    }

    throw new ApiRequestError('Request failed.', {
      status: response.status,
      details: rawPayload.trim() ? [rawPayload.trim().slice(0, 200)] : [],
    });
  }

  if (payload === null) {
    throw new ApiRequestError('Invalid response from server.', {
      code: 'INVALID_JSON_RESPONSE',
      status: response.status,
      details: rawPayload.trim() ? [rawPayload.trim().slice(0, 200)] : [],
    });
  }

  return payload as T;
};

const parseFilenameFromDisposition = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() ?? null;
};

const requestCsv = async (
  path: string,
  token: string,
  fallbackFilename: string,
): Promise<CsvDownloadResult> => {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });
  } catch (error) {
    throw new ApiRequestError('Network request failed.', {
      code: 'NETWORK_ERROR',
      status: 0,
      details: [error instanceof Error ? error.message : 'Unknown network error'],
    });
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      void handleUnauthorizedResponse();
    }

    const bodyText = await response.text();

    try {
      const payload = JSON.parse(bodyText) as ApiErrorEnvelope;
      if (payload?.success === false) {
        throw new ApiRequestError(payload.error.message, {
          code: payload.error.code,
          details: payload.error.details,
          status: response.status,
        });
      }
    } catch (parseError) {
      if (parseError instanceof ApiRequestError) {
        throw parseError;
      }
    }

    throw new ApiRequestError('Request failed.', {
      status: response.status,
      details: bodyText.trim() ? [bodyText.trim().slice(0, 200)] : [],
    });
  }

  const blob = await response.blob();
  const filename =
    parseFilenameFromDisposition(response.headers.get('content-disposition')) ??
    fallbackFilename;

  return { blob, filename };
};

export const checkApiHealth = async (): Promise<'ok' | 'unreachable'> => {
  try {
    const payload = await apiRequest<HealthResponse>('/healthz');
    return payload.success && payload.data.status === 'ok' ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
};

export const registerWithPassword = async (body: RegisterPayload) => {
  const payload = await apiRequest<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return payload.data;
};

export const loginWithPassword = async (body: LoginPayload) => {
  const payload = await apiRequest<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return payload.data;
};

export const fetchCurrentUser = async (token: string) => {
  const payload = await apiRequest<CurrentUserResponse>('/api/v1/auth/me', {}, token);
  return payload.data;
};

export const sendFinnyChatMessage = async (
  body: FinnyChatPayload,
  token: string,
): Promise<FinnyChatPayloadData> => {
  const payload = await apiRequest<FinnyChatResponse>(
    '/api/v1/finny/chat',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  const responseData = payload.data;

  if (responseData.format === 'insight_card' && responseData.card) {
    return {
      format: 'insight_card',
      card: responseData.card as FinnyInsightCard,
      ...(responseData.meta ? { meta: responseData.meta } : {}),
    };
  }

  if (responseData.format === 'card' && responseData.card) {
    return {
      format: 'card',
      card: responseData.card,
      ...(responseData.meta ? { meta: responseData.meta } : {}),
    };
  }

  if (responseData.format === 'text' && typeof responseData.text === 'string') {
    return {
      format: 'text',
      text: responseData.text.trim().length > 0
        ? responseData.text.trim()
        : 'Finny response is unavailable right now.',
      ...(responseData.meta ? { meta: responseData.meta } : {}),
    };
  }

  if (typeof responseData.reply === 'string' && responseData.reply.trim().length > 0) {
    return {
      format: 'text',
      text: responseData.reply.trim(),
      ...(responseData.meta ? { meta: responseData.meta } : {}),
    };
  }

  if (typeof responseData.content === 'string' && responseData.content.trim().length > 0) {
    return {
      format: 'text',
      text: responseData.content.trim(),
      ...(responseData.meta ? { meta: responseData.meta } : {}),
    };
  }

  return {
    format: 'text',
    text:
      typeof responseData.replyTextFallback === 'string' && responseData.replyTextFallback.trim().length > 0
        ? responseData.replyTextFallback.trim()
        : 'Finny response is unavailable right now.',
    ...(responseData.meta ? { meta: responseData.meta } : {}),
  };
};

export const logoutRequest = async (token?: string | null) => {
  const payload = await apiRequest<LogoutResponse>(
    '/api/v1/auth/logout',
    {
      method: 'POST',
    },
    token ?? undefined,
  );
  return payload.data;
};

export const fetchProfile = async (token: string) => {
  const payload = await apiRequest<CurrentUserResponse>('/api/v1/profile', {}, token);
  return payload.data;
};

export const exportBudgetCsv = async (query: BudgetExportQuery, token: string) => {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
  });

  return requestCsv(
    `/api/v1/exports/budget.csv?${params.toString()}`,
    token,
    `finvision-budget-${query.from}_to_${query.to}.csv`,
  );
};

export const exportInvestCsv = async (query: InvestExportQuery, token: string) => {
  const params = new URLSearchParams({
    range: query.range ?? 'month',
  });

  if (typeof query.year === 'number') {
    params.set('year', String(query.year));
  }

  if (typeof query.month === 'number') {
    params.set('month', String(query.month));
  }

  return requestCsv('/api/v1/exports/invest.csv?' + params.toString(), token, 'finvision-invest.csv');
};

export const fetchCategories = async (token: string) => {
  const payload = await apiRequest<CategoriesResponse>('/api/v1/categories', {}, token);
  return payload.data;
};

export const fetchNewsArticles = async (
  query: NewsQuery = {},
  options: { signal?: AbortSignal } = {},
) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  const path = queryString ? `/api/v1/news?${queryString}` : '/api/v1/news';
  const payload = await apiRequest<NewsResponse>(
    path,
    {
      signal: options.signal,
    },
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const fetchInsights = async (token: string, limit = 3) => {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  const payload = await apiRequest<InsightsResponse>(
    `/api/v1/insights?${params.toString()}`,
    {},
    token,
  );

  return payload.data;
};

export const dismissInsight = async (insightId: string, token: string) => {
  const payload = await apiRequest<DismissInsightResponse>(
    `/api/v1/insights/${insightId}/dismiss`,
    {
      method: 'POST',
    },
    token,
  );

  return payload.data;
};

export const fetchInvestAccount = async (token: string) => {
  const payload = await apiRequest<InvestAccountResponse>('/api/v1/invest/account', {}, token);
  return payload.data;
};

export const fetchInvestCryptoState = async (token: string) => {
  const payload = await apiRequest<InvestCryptoStateResponse>('/api/v1/invest/crypto/state', {}, token);
  return payload.data;
};

export const setInvestCryptoMode = async (mode: InvestCryptoMode, token: string) => {
  const payload = await apiRequest<InvestCryptoModeResponse>(
    '/api/v1/invest/crypto/mode',
    {
      method: 'POST',
      body: JSON.stringify({ mode }),
    },
    token,
  );

  return payload.data;
};

export const setInvestCryptoDemoBudget = async (amountEUR: number, token: string) => {
  const payload = await apiRequest<InvestCryptoDemoBudgetResponse>(
    '/api/v1/invest/crypto/demo/set-budget',
    {
      method: 'POST',
      body: JSON.stringify({ amountEUR }),
    },
    token,
  );

  return payload.data;
};

export const fetchInvestHoldings = async (token: string) => {
  const payload = await apiRequest<InvestHoldingsResponse>('/api/v1/invest/holdings', {}, token);
  return payload.data;
};

export const fetchInvestTrades = async (token: string, limit = 50) => {
  const payload = await apiRequest<InvestTradesResponse>(
    `/api/v1/invest/trades?limit=${limit}`,
    {},
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const fetchInvestSnapshots = async (token: string, days = 7) => {
  const payload = await apiRequest<InvestSnapshotsResponse>(
    `/api/v1/invest/snapshots?days=${days}`,
    {},
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const fetchInvestPerformance = async (token: string, range: '7d' | '30d' = '7d') => {
  const payload = await apiRequest<InvestPerformanceResponse>(
    `/api/v1/invest/performance?range=${range}`,
    {},
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const fetchInvestFunding = async (token: string, limit = 20) => {
  const payload = await apiRequest<InvestFundingResponse>(
    `/api/v1/invest/funding?limit=${limit}`,
    {},
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const topUpInvestCryptoFromWallet = async (amountRON: number, token: string) => {
  const payload = await apiRequest<InvestCryptoTopUpFromWalletResponse>(
    '/api/v1/invest/crypto/topup-from-wallet',
    {
      method: 'POST',
      body: JSON.stringify({ amountRON }),
    },
    token,
  );

  return payload.data;
};

export const fetchInvestingWallet = async (token: string) => {
  const payload = await apiRequest<InvestingWalletResponse>('/api/v1/investing-wallet', {}, token);
  return payload.data;
};

export const fetchInvestingWalletSummary = async (
  token: string,
  year: number,
  month: number,
) => {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  const payload = await apiRequest<InvestingWalletSummaryResponse>(
    `/api/v1/investing-wallet/summary?${params.toString()}`,
    {},
    token,
  );

  return payload.data;
};

export const updateInvestingWallet = async (body: InvestingWalletUpdatePayload, token: string) => {
  const payload = await apiRequest<InvestingWalletResponse>(
    '/api/v1/investing-wallet',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const depositInvestingWallet = async (body: InvestingWalletDepositPayload, token: string) => {
  const payload = await apiRequest<InvestingWalletResponse>(
    '/api/v1/investing-wallet/deposit',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const fetchInvestingWalletConvertQuote = async (amountRON: number, token: string) => {
  const params = new URLSearchParams({
    amountRON: String(amountRON),
  });
  const payload = await apiRequest<ApiSuccessEnvelope<InvestingWalletConvertQuote>>(
    `/api/v1/investing-wallet/convert/quote?${params.toString()}`,
    {},
    token,
  );
  return payload.data;
};

export const fetchInvestingWalletLedger = async (token: string, limit = 20) => {
  const payload = await apiRequest<InvestingWalletLedgerResponse>(
    `/api/v1/investing-wallet/ledger?limit=${limit}`,
    {},
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const placeInvestOrder = async (body: InvestOrderPayload, token: string) => {
  const payload = await apiRequest<InvestOrderResponse>(
    '/api/v1/invest/order',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const fetchMarketAccount = async (token: string) => {
  const payload = await apiRequest<MarketAccountResponse>('/api/v1/market/stocks/account', {}, token);
  return payload.data;
};

export const fetchMarketHoldings = async (token: string) => {
  const payload = await apiRequest<MarketHoldingsResponse>('/api/v1/market/stocks/holdings', {}, token);
  return payload.data;
};

export const fetchMarketTrades = async (token: string, limit = 50) => {
  const payload = await apiRequest<MarketTradesResponse>(
    `/api/v1/market/stocks/trades?limit=${limit}`,
    {},
    token,
  );

  return payload.data;
};

export const fetchMarketAllocation = async (token: string) => {
  const payload = await apiRequest<MarketAllocationResponse>('/api/v1/market/stocks/allocation', {}, token);
  return payload.data;
};

export const fetchMarketPerformance = async (
  token: string,
  range: '7d' | '30d' = '7d',
) => {
  const payload = await apiRequest<MarketPerformanceResponse>(
    `/api/v1/market/stocks/performance?range=${range}`,
    {},
    token,
  );
  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const topUpMarketFromWallet = async (amountRON: number, token: string) => {
  const payload = await apiRequest<MarketTopUpFromWalletResponse>(
    '/api/v1/market/stocks/topup-from-wallet',
    {
      method: 'POST',
      body: JSON.stringify({ amountRON }),
    },
    token,
  );

  return payload.data;
};

export const fetchMarketStockExecutionQuote = async (symbol: string, token: string) => {
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
  });
  const payload = await apiRequest<InvestStockQuoteResponse>(
    `/api/v1/market/stocks/order/quote?${params.toString()}`,
    {},
    token,
  );

  return payload.data;
};

export const placeMarketStockOrder = async (body: InvestStockOrderPayload, token: string) => {
  const payload = await apiRequest<InvestOrderResponse>(
    '/api/v1/market/stocks/order',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const resetMarketDemoPortfolio = async (token: string) => {
  const payload = await apiRequest<MarketResetResponse>(
    '/api/v1/market/stocks/reset',
    {
      method: 'POST',
    },
    token,
  );

  return payload.data;
};

export const fetchMarketStocksState = async (token: string) => {
  const payload = await apiRequest<MarketStocksStateResponse>('/api/v1/market/stocks/state', {}, token);
  return payload.data;
};

export const setMarketStocksMode = async (mode: MarketStocksMode, token: string) => {
  const payload = await apiRequest<MarketStocksModeResponse>(
    '/api/v1/market/stocks/mode',
    {
      method: 'POST',
      body: JSON.stringify({ mode }),
    },
    token,
  );

  return payload.data;
};

export const setMarketStocksDemoBudget = async (amountEUR: number, token: string) => {
  const payload = await apiRequest<MarketDemoBudgetResponse>(
    '/api/v1/market/stocks/demo/set-budget',
    {
      method: 'POST',
      body: JSON.stringify({ amountEUR }),
    },
    token,
  );

  return payload.data;
};

export const resetMarketStocksAdminState = async (token: string) => {
  const payload = await apiRequest<MarketAdminResetResponse>(
    '/api/v1/market/stocks/admin/reset',
    {
      method: 'POST',
    },
    token,
  );

  return payload.data;
};

export const resetDemoPortfolio = async (token: string) => {
  const payload = await apiRequest<InvestResetResponse>(
    '/api/v1/invest/reset',
    {
      method: 'POST',
    },
    token,
  );

  return payload.data;
};

export const searchCryptoMarket = async (
  query: { q?: string },
  token: string,
  options: { signal?: AbortSignal } = {},
) => {
  const params = new URLSearchParams();
  const normalizedQuery = query.q?.trim() ?? '';
  const resolvedQuery = normalizedQuery.length >= 2 ? normalizedQuery : 'bitcoin';

  params.set('q', resolvedQuery);

  const path = `/api/v1/market/crypto/search${params.toString() ? `?${params.toString()}` : ''}`;
  const payload = await apiRequest<MarketSearchResponse>(
    path,
    { signal: options.signal },
    token,
  );

  return payload.data;
};

export const fetchCryptoQuotes = async (
  coinIds: string[],
  token: string,
  options: { vs?: 'usd' | 'eur' | 'ron'; signal?: AbortSignal } = {},
) => {
  const ids = [...new Set(coinIds.map((coinId) => coinId.trim().toLowerCase()).filter(Boolean))];

  if (ids.length === 0) {
    return {
      quotes: {},
      requestedVs: options.vs ?? 'eur',
      usedVs: 'eur',
      pricingCurrency: 'EUR',
      pricingNote: null,
    } as MarketQuoteResponse['data'];
  }

  const params = new URLSearchParams({
    coinIds: ids.join(','),
    vs: options.vs ?? 'eur',
  });

  const payload = await apiRequest<MarketQuoteResponse>(
    `/api/v1/market/crypto/quote?${params.toString()}`,
    { signal: options.signal },
    token,
  );

  return payload.data;
};

export const fetchCryptoChart = async (
  coinId: string,
  token: string,
  options: { vs?: 'usd' | 'eur' | 'ron'; days?: 1 | 7 | 30 | 365; signal?: AbortSignal } = {},
) => {
  const params = new URLSearchParams({
    coinId,
    vs: options.vs ?? 'eur',
    days: String(options.days ?? 7),
  });

  const payload = await apiRequest<MarketChartResponse>(
    `/api/v1/market/crypto/chart?${params.toString()}`,
    { signal: options.signal },
    token,
  );

  return payload.data;
};

export const fetchStockSearch = async (
  q: string,
  token: string,
  options: { signal?: AbortSignal } = {},
) => {
  const normalizedQuery = q.trim();

  if (!normalizedQuery) {
    return {
      results: [],
    };
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
  });
  const payload = await apiRequest<StockSearchResponse>(
    `/api/v1/market/stocks/search?${params.toString()}`,
    { signal: options.signal },
    token,
  );

  return payload.data;
};

export const fetchStockQuotes = async (
  symbols: string[],
  token: string,
  options: { signal?: AbortSignal } = {},
) => {
  const normalizedSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];

  if (normalizedSymbols.length === 0) {
    return {
      quotes: [],
    };
  }

  const params = new URLSearchParams({
    symbols: normalizedSymbols.join(','),
  });
  const payload = await apiRequest<StockQuoteResponse>(
    `/api/v1/market/stocks/quote?${params.toString()}`,
    { signal: options.signal },
    token,
  );

  return payload.data;
};

export const fetchStockProfile = async (
  symbol: string,
  token: string,
  options: { signal?: AbortSignal } = {},
) => {
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
  });
  const payload = await apiRequest<StockProfileResponse>(
    `/api/v1/market/stocks/profile?${params.toString()}`,
    { signal: options.signal },
    token,
  );

  return payload.data;
};

export const fetchStockCandles = async (
  symbol: string,
  range: StockChartRange,
  token: string,
  options: { signal?: AbortSignal } = {},
) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const params = new URLSearchParams({
    symbol: normalizedSymbol,
    range,
  });
  const path = `/api/v1/market/stocks/candles?${params.toString()}`;
  const payload = await apiRequest<StockCandlesResponse>(
    path,
    { signal: options.signal },
    token,
  );

  return {
    ...payload.data,
    meta: payload.data?.meta ?? payload.meta ?? null,
  };
};

export const fetchTransactions = async (query: TransactionsQuery, token: string) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const payload = await apiRequest<TransactionsResponse>(
    `/api/v1/transactions?${params.toString()}`,
    {},
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
  };
};

export const fetchBudgetSummary = async (
  token: string,
  year: number,
  month: number,
) => {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  const payload = await apiRequest<BudgetSummaryResponse>(
    `/api/v1/budget/summary?${params.toString()}`,
    {},
    token,
  );

  return payload.data;
};

export const createTransaction = async (body: CreateTransactionPayload, token: string) => {
  const payload = await apiRequest<CreateTransactionResponse>(
    '/api/v1/transactions',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const updateTransaction = async (
  transactionId: string,
  body: CreateTransactionPayload,
  token: string,
) => {
  const payload = await apiRequest<CreateTransactionResponse>(
    `/api/v1/transactions/${transactionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const deleteTransaction = async (transactionId: string, token: string) => {
  await apiRequest<ApiSuccessEnvelope<{ deleted: boolean; transactionId: string }>>(
    `/api/v1/transactions/${transactionId}`,
    {
      method: 'DELETE',
    },
    token,
  );
};

export const updateMonthlyBudgetGoal = async (monthlyBudgetGoal: number, token: string) => {
  const payload = await apiRequest<UpdateBudgetGoalResponse>(
    '/api/v1/profile/budget-goal',
    {
      method: 'PATCH',
      body: JSON.stringify({ monthlyBudgetGoal }),
    },
    token,
  );

  return payload.data;
};

export const updateInvestingProfile = async (
  investingMonthlyContributionGoal: number,
  token: string,
) => {
  const payload = await apiRequest<UpdateInvestingProfileResponse>(
    '/api/v1/profile/investing',
    {
      method: 'PATCH',
      body: JSON.stringify({ investingMonthlyContributionGoal }),
    },
    token,
  );

  return payload.data;
};

export const updateProfile = async (body: UpdateProfilePayload, token: string) => {
  const payload = await apiRequest<UpdateProfileResponse>(
    '/api/v1/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const updatePassword = async (body: UpdatePasswordPayload, token: string) => {
  const payload = await apiRequest<UpdatePasswordResponse>(
    '/api/v1/profile/password',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

const buildQueryString = (query: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  return params.toString();
};

export const fetchEducationArticles = async (query: EducationArticlesQuery = {}) => {
  const queryString = buildQueryString(query);
  const path = queryString
    ? `/api/v1/education/articles?${queryString}`
    : '/api/v1/education/articles';

  const payload = await apiRequest<EducationArticlesResponse>(path);
  return payload.data;
};

export const fetchEducationArticle = async (idOrSlug: string) => {
  const payload = await apiRequest<EducationArticleResponse>(`/api/v1/education/articles/${idOrSlug}`);
  return payload.data;
};

export const completeEducationArticle = async (articleId: string, token: string) => {
  const payload = await apiRequest<EducationCompleteArticleResponse>(
    `/api/v1/education/articles/${articleId}/complete`,
    { method: 'POST' },
    token,
  );

  return payload.data;
};

export const fetchEducationQuizzes = async (query: EducationQuizzesQuery = {}) => {
  const queryString = buildQueryString(query);
  const path = queryString
    ? `/api/v1/education/quizzes?${queryString}`
    : '/api/v1/education/quizzes';

  const payload = await apiRequest<EducationQuizzesResponse>(path);
  return payload.data;
};

export const fetchEducationQuiz = async (quizId: string) => {
  const payload = await apiRequest<EducationQuizResponse>(`/api/v1/education/quizzes/${quizId}`);
  return payload.data;
};

export const submitEducationQuizAttempt = async (
  quizId: string,
  body: EducationQuizAttemptPayload,
  token: string,
) => {
  const payload = await apiRequest<EducationQuizAttemptResponse>(
    `/api/v1/education/quizzes/${quizId}/attempts`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const fetchEducationProgress = async (token: string) => {
  const payload = await apiRequest<EducationProgressResponse>('/api/v1/education/progress', {}, token);
  return payload.data;
};
