const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5001';

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
  investingAccountBalance: number;
};

export type BudgetCategory = {
  id: string;
  name: string;
  slug: string;
  color: string;
  kind: 'income' | 'expense' | 'both';
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

export type PortfolioAccount = {
  id: string;
  cashBalance: number;
  baseCurrency: 'EUR';
  pricingCurrency: 'EUR';
  pricingVs: 'eur';
  pricingNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PortfolioHolding = {
  id: string;
  assetType: 'crypto' | 'stock';
  coinId: string | null;
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  change24h: number | null;
  marketValue: number;
  unrealizedPnL: number;
  allocationPct: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PortfolioTotals = {
  cashBalance: number;
  holdingsValue: number;
  totalValue: number;
  unrealizedPnL: number;
  holdingsCount: number;
};

export type PortfolioTrade = {
  id: string;
  assetType: 'crypto' | 'stock';
  coinId: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  createdAt: string | null;
};

export type PortfolioSnapshot = {
  id: string;
  date: string;
  totalValue: number;
  cashBalance: number;
  holdingsValue: number;
  createdAt: string | null;
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

export type StockChartRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

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
}>;

type CurrentUserResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type CategoriesResponse = ApiSuccessEnvelope<{
  categories: BudgetCategory[];
}>;

type TransactionsResponse = ApiSuccessEnvelope<{
  transactions: BudgetTransaction[];
}>;

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
  account: PortfolioAccount;
}>;

type InvestHoldingsResponse = ApiSuccessEnvelope<{
  account: PortfolioAccount;
  holdings: PortfolioHolding[];
  totals: PortfolioTotals;
}>;

type InvestTradesResponse = ApiSuccessEnvelope<{
  trades: PortfolioTrade[];
}>;

type InvestSnapshotsResponse = ApiSuccessEnvelope<{
  snapshots: PortfolioSnapshot[];
}>;

type InvestFundingResponse = ApiSuccessEnvelope<{
  funding: InvestFundingEntry[];
}>;

type InvestTopUpQuoteResponse = ApiSuccessEnvelope<{
  fromCurrency: 'RON';
  fromAmount: number;
  toCurrency: 'EUR';
  estimatedEUR: number;
  rate: number;
  provider: string;
  date: string;
}>;

type InvestTopUpResponse = ApiSuccessEnvelope<{
  cashBalanceEUR: number;
  addedEUR: number;
  rate: number;
  fromAmountRON: number;
}>;

type InvestingWalletResponse = ApiSuccessEnvelope<InvestingWallet>;

type InvestingWalletSummaryResponse = ApiSuccessEnvelope<InvestingWalletSummary>;

type InvestingWalletLedgerResponse = ApiSuccessEnvelope<{
  entries: InvestingWalletLedgerEntry[];
}>;

type InvestingWalletConvertResponse = ApiSuccessEnvelope<{
  walletBalanceRON: number;
  addedEUR: number;
  portfolioCashEUR: number;
  rate: {
    eurPerRon: number;
    ronPerEur: number | null;
  };
}>;

type InvestOrderResponse = ApiSuccessEnvelope<{
  trade: PortfolioTrade;
  account: PortfolioAccount;
  holdingsSummary: PortfolioTotals;
}>;

type InvestResetResponse = ApiSuccessEnvelope<{
  account: PortfolioAccount;
  totals: PortfolioTotals;
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
  avatarUrl?: string;
  baseCurrency?: 'RON' | 'EUR' | 'USD';
  locale?: 'en-US' | 'ro-RO';
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

type InvestTopUpPayload = {
  fromCurrency: 'RON';
  amount: number;
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

export const fetchProfile = async (token: string) => {
  const payload = await apiRequest<CurrentUserResponse>('/api/v1/profile', {}, token);
  return payload.data;
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

export const fetchInvestAccount = async (token: string) => {
  const payload = await apiRequest<InvestAccountResponse>('/api/v1/invest/account', {}, token);
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

export const fetchInvestTopUpQuote = async (
  amount: number,
  token: string,
  fromCurrency: 'RON' = 'RON',
) => {
  const params = new URLSearchParams({
    amount: String(amount),
    fromCurrency,
  });
  const payload = await apiRequest<InvestTopUpQuoteResponse>(
    `/api/v1/invest/topup/quote?${params.toString()}`,
    {},
    token,
  );

  return payload.data;
};

export const topUpInvestingCash = async (body: InvestTopUpPayload, token: string) => {
  const payload = await apiRequest<InvestTopUpResponse>(
    '/api/v1/invest/topup',
    {
      method: 'POST',
      body: JSON.stringify(body),
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

export const convertInvestingWalletToEur = async (amountRON: number, token: string) => {
  const payload = await apiRequest<InvestingWalletConvertResponse>(
    '/api/v1/investing-wallet/convert',
    {
      method: 'POST',
      body: JSON.stringify({ amountRON }),
    },
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

export const placeInvestStockOrder = async (body: InvestStockOrderPayload, token: string) => {
  const payload = await apiRequest<InvestOrderResponse>(
    '/api/v1/invest/stocks/order',
    {
      method: 'POST',
      body: JSON.stringify(body),
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
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
    range,
  });
  const payload = await apiRequest<StockCandlesResponse>(
    `/api/v1/market/stocks/candles?${params.toString()}`,
    { signal: options.signal },
    token,
  );

  return {
    ...payload.data,
    meta: payload.meta ?? null,
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
