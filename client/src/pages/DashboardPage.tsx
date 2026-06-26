import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AddTransactionModal } from '../components/AddTransactionModal';
import { AppShell } from '../components/AppShell';
import { OnboardingChecklistCard } from '../components/OnboardingChecklistCard';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  createTransaction,
  dismissInsight,
  fetchCategories,
  fetchEducationProgress,
  fetchInsights,
  fetchInvestHoldings,
  fetchInvestTrades,
  fetchInvestingWallet,
  fetchInvestingWalletLedger,
  fetchMarketHoldings,
  fetchNewsArticles,
  fetchProfile,
  fetchStockQuotes,
  fetchTransactions,
  type AuthUser,
  type BudgetCategory,
  type BudgetTransaction,
  type EducationProgress,
  type InvestingWallet,
  type InvestingWalletLedgerEntry,
  type Insight,
  type NewsArticle,
  type PortfolioHolding,
  type PortfolioTotals,
  type StockQuote,
} from '../lib/api';
import { formatMoney, formatPct } from '../lib/formatters';

type RecurrenceValue = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
type WidgetKey = 'budget' | 'invest' | 'market' | 'learn' | 'news' | 'insights';

type OnboardingActionItem = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href?: string;
  onGo?: () => void;
};

const MARKET_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'];
const EMPTY_PORTFOLIO_TOTALS: PortfolioTotals = {
  cashBalance: 0,
  holdingsValue: 0,
  totalValue: 0,
  unrealizedPnL: 0,
  holdingsCount: 0,
};
const DONUT_COLORS = ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6', '#8dab1e'];
const ONBOARDING_DISMISSED_KEY = 'finvision_onboarding_dismissed';

const getCurrentMonthRange = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

  return { from, to };
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiRequestError) {
    if (error.message.trim().toLowerCase() === 'network request failed') {
      return fallback;
    }

    return error.message;
  }

  return fallback;
};

const formatTransactionDate = (value: string) =>
  new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

const buildDonutBackground = (
  slices: {
    value: number;
    color: string;
  }[],
) => {
  if (slices.length === 0) {
    return '#e2e8f0';
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return '#e2e8f0';
  }

  let cursor = 0;
  const stops = slices.map((slice) => {
    const percentage = (slice.value / total) * 100;
    const start = cursor;
    cursor += percentage;

    return `${slice.color} ${start.toFixed(2)}% ${Math.min(cursor, 100).toFixed(2)}%`;
  });

  return `conic-gradient(${stops.join(', ')})`;
};

const getInitialOnboardingDismissed = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
};

function RetryButton({
  onRetry,
  label = 'Retry',
}: {
  onRetry: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="fv-secondary-btn mt-3 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold"
    >
      {label}
    </button>
  );
}

function KpiSkeleton() {
  return <div className="fv-card h-[11.25rem] animate-pulse rounded-[1.25rem] p-5" />;
}

export function DashboardPage() {
  const { accessToken, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [widgetErrors, setWidgetErrors] = useState<Partial<Record<WidgetKey, string>>>({});
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [allTimeTransactionsCount, setAllTimeTransactionsCount] = useState(0);
  const [cryptoPortfolioTotals, setCryptoPortfolioTotals] = useState<PortfolioTotals>(EMPTY_PORTFOLIO_TOTALS);
  const [stockPortfolioTotals, setStockPortfolioTotals] = useState<PortfolioTotals>(EMPTY_PORTFOLIO_TOTALS);
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<StockQuote[]>([]);
  const [learningProgress, setLearningProgress] = useState<EducationProgress | null>(null);
  const [newsItems, setNewsItems] = useState<NewsArticle[]>([]);
  const [investingWallet, setInvestingWallet] = useState<InvestingWallet | null>(null);
  const [investingWalletLedger, setInvestingWalletLedger] = useState<InvestingWalletLedgerEntry[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dismissingInsightId, setDismissingInsightId] = useState<string | null>(null);
  const [cryptoTradesCount, setCryptoTradesCount] = useState(0);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(getInitialOnboardingDismissed);

  const loadHomeData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setWidgetErrors({});
    const nextWidgetErrors: Partial<Record<WidgetKey, string>> = {};
    const { from, to } = getCurrentMonthRange();

    const [
      profileResult,
      categoriesResult,
      monthlyTransactionsResult,
      allTimeTransactionsResult,
      investResult,
      marketHoldingsResult,
      investTradesResult,
      walletResult,
      walletLedgerResult,
      marketResult,
      learnResult,
      newsResult,
      insightsResult,
    ] = await Promise.allSettled([
      fetchProfile(accessToken),
      fetchCategories(accessToken),
      fetchTransactions(
        {
          from,
          to,
          sort: '-date',
        },
        accessToken,
      ),
      fetchTransactions(
        {
          from: '1970-01-01',
          to: new Date().toISOString().slice(0, 10),
          sort: '-date',
          page: 1,
          limit: 1,
        },
        accessToken,
      ),
      fetchInvestHoldings(accessToken),
      fetchMarketHoldings(accessToken),
      fetchInvestTrades(accessToken, 1),
      fetchInvestingWallet(accessToken),
      fetchInvestingWalletLedger(accessToken, 200),
      fetchStockQuotes(MARKET_SYMBOLS, accessToken),
      fetchEducationProgress(accessToken),
      fetchNewsArticles({ topic: 'all', limit: 3, page: 1 }),
      fetchInsights(accessToken, 3),
    ]);

    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value.user);
    } else {
      setProfile(user);
    }

    if (categoriesResult.status === 'fulfilled') {
      setCategories(categoriesResult.value.categories);
    } else {
      setCategories([]);
      nextWidgetErrors.budget = getErrorMessage(
        categoriesResult.reason,
        'Budget categories are unavailable right now.',
      );
    }

    if (monthlyTransactionsResult.status === 'fulfilled') {
      setTransactions(monthlyTransactionsResult.value.transactions);
    } else {
      setTransactions([]);
      nextWidgetErrors.budget = getErrorMessage(
        monthlyTransactionsResult.reason,
        'Budget transactions are unavailable right now.',
      );
    }

    if (allTimeTransactionsResult.status === 'fulfilled') {
      const totalFromMeta = allTimeTransactionsResult.value.meta?.total;
      setAllTimeTransactionsCount(
        typeof totalFromMeta === 'number'
          ? totalFromMeta
          : allTimeTransactionsResult.value.transactions.length,
      );
    } else {
      setAllTimeTransactionsCount(0);
    }

    if (investResult.status === 'fulfilled') {
      setCryptoPortfolioTotals(investResult.value.totals);
      setPortfolioHoldings(investResult.value.holdings);
    } else {
      setCryptoPortfolioTotals(EMPTY_PORTFOLIO_TOTALS);
      setPortfolioHoldings([]);
      nextWidgetErrors.invest = getErrorMessage(
        investResult.reason,
        'Portfolio summary is unavailable right now.',
      );
    }

    if (marketHoldingsResult.status === 'fulfilled') {
      setStockPortfolioTotals(marketHoldingsResult.value.totals);
      setPortfolioHoldings((current) => [...current, ...marketHoldingsResult.value.holdings]);
    } else {
      setStockPortfolioTotals(EMPTY_PORTFOLIO_TOTALS);
    }

    if (investTradesResult.status === 'fulfilled') {
      setCryptoTradesCount(investTradesResult.value.trades.length > 0 ? 1 : 0);
    } else {
      setCryptoTradesCount(0);
    }

    if (walletResult.status === 'fulfilled') {
      setInvestingWallet(walletResult.value);
    } else {
      setInvestingWallet(null);
    }

    if (walletLedgerResult.status === 'fulfilled') {
      setInvestingWalletLedger(walletLedgerResult.value.entries);
    } else {
      setInvestingWalletLedger([]);
    }

    if (marketResult.status === 'fulfilled') {
      setMarketQuotes(marketResult.value.quotes);
    } else {
      setMarketQuotes([]);
      nextWidgetErrors.market = getErrorMessage(
        marketResult.reason,
        'Market snapshot is unavailable right now.',
      );
    }

    if (learnResult.status === 'fulfilled') {
      setLearningProgress(learnResult.value.progress);
    } else {
      setLearningProgress(null);
      nextWidgetErrors.learn = getErrorMessage(
        learnResult.reason,
        'Learning progress is unavailable right now.',
      );
    }

    if (newsResult.status === 'fulfilled') {
      setNewsItems(newsResult.value.articles);
    } else {
      setNewsItems([]);
      nextWidgetErrors.news = getErrorMessage(newsResult.reason, 'News is unavailable right now.');
    }

    if (insightsResult.status === 'fulfilled') {
      setInsights(insightsResult.value.insights);
    } else {
      setInsights([]);
      nextWidgetErrors.insights = getErrorMessage(
        insightsResult.reason,
        'Finny insights are unavailable right now.',
      );
    }

    setWidgetErrors(nextWidgetErrors);
    setIsLoading(false);
  }, [accessToken, user]);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, onboardingDismissed ? 'true' : 'false');
  }, [onboardingDismissed]);

  const handleDismissInsight = useCallback(async (insightId: string) => {
    if (!accessToken || dismissingInsightId) {
      return;
    }

    setDismissingInsightId(insightId);

    try {
      await dismissInsight(insightId, accessToken);
      setInsights((current) => current.filter((insight) => insight.id !== insightId));
    } catch (error) {
      setWidgetErrors((current) => ({
        ...current,
        insights: getErrorMessage(error, 'Unable to dismiss insight right now.'),
      }));
    } finally {
      setDismissingInsightId(null);
    }
  }, [accessToken, dismissingInsightId]);

  const activeProfile = profile ?? user;
  const budgetDisplayCurrency = activeProfile?.baseCurrency ?? 'USD';
  const portfolioDisplayCurrency = 'EUR';

  const budgetSummary = useMemo(() => {
    const income = transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const budgetGoal =
      typeof activeProfile?.monthlyBudgetGoal === 'number' && activeProfile.monthlyBudgetGoal > 0
        ? activeProfile.monthlyBudgetGoal
        : null;
    const remainingBudget = budgetGoal !== null ? budgetGoal - expenses : null;
    const percentSpent =
      budgetGoal && budgetGoal > 0 ? Math.min(100, (expenses / budgetGoal) * 100) : null;

    const categoryTotals = new Map<string, { label: string; value: number; color: string }>();

    transactions.forEach((transaction) => {
      if (transaction.type !== 'expense') {
        return;
      }

      const label = transaction.category?.name ?? 'Uncategorized';
      const color = transaction.category?.color ?? '#94a3b8';
      const existing = categoryTotals.get(label);

      if (existing) {
        existing.value += transaction.amount;
        return;
      }

      categoryTotals.set(label, {
        label,
        value: transaction.amount,
        color,
      });
    });

    const sortedCategories = [...categoryTotals.values()].sort((left, right) => right.value - left.value);
    const topFour = sortedCategories.slice(0, 4);
    const otherTotal = sortedCategories.slice(4).reduce((sum, item) => sum + item.value, 0);
    const donutSlices = [
      ...topFour.map((item, index) => ({
        ...item,
        color: item.color || DONUT_COLORS[index % DONUT_COLORS.length],
      })),
      ...(otherTotal > 0
        ? [
            {
              label: 'Other',
              value: otherTotal,
              color: DONUT_COLORS[DONUT_COLORS.length - 1],
            },
          ]
        : []),
    ];

    return {
      income,
      expenses,
      budgetGoal,
      remainingBudget,
      percentSpent,
      topCategory: sortedCategories[0] ?? null,
      donutSlices,
      recentTransactions: transactions.slice(0, 5),
    };
  }, [activeProfile?.monthlyBudgetGoal, transactions]);

  const portfolioSummary = useMemo(() => {
    const totalValue = cryptoPortfolioTotals.totalValue + stockPortfolioTotals.totalValue;
    const cashBalance = cryptoPortfolioTotals.cashBalance + stockPortfolioTotals.cashBalance;
    const holdingsValue = cryptoPortfolioTotals.holdingsValue + stockPortfolioTotals.holdingsValue;

    return {
      totalValue,
      cashBalance,
      holdingsValue,
      hasAnyPortfolioData: totalValue > 0 || holdingsValue > 0,
    };
  }, [cryptoPortfolioTotals, stockPortfolioTotals]);

  const topHolding = useMemo(() => {
    if (portfolioHoldings.length === 0) {
      return null;
    }

    return [...portfolioHoldings].sort((left, right) => right.marketValue - left.marketValue)[0];
  }, [portfolioHoldings]);

  const lastQuizAttempt = learningProgress?.recentAttempts?.[0] ?? null;
  const canAddTransaction = categories.length > 0 && !isLoading && Boolean(accessToken);

  const hasDepositOrAutoFund = useMemo(
    () =>
      investingWalletLedger.some(
        (entry) => entry.type === 'deposit' || entry.type === 'autofund',
      ),
    [investingWalletLedger],
  );

  const hasConvertToEur = useMemo(
    () => investingWalletLedger.some((entry) => entry.type === 'fx_convert_to_eur'),
    [investingWalletLedger],
  );

  const onboardingItems = useMemo<OnboardingActionItem[]>(
    () => [
      {
        id: 'set-budget',
        title: 'Set your monthly budget',
        description: 'Define your budget goal in Budget & Expenses.',
        completed: typeof activeProfile?.monthlyBudgetGoal === 'number' && activeProfile.monthlyBudgetGoal > 0,
        href: '/budget',
      },
      {
        id: 'first-transaction',
        title: 'Add your first transaction',
        description: 'Track your first income or expense.',
        completed: allTimeTransactionsCount > 0,
        onGo: () => setIsTransactionModalOpen(true),
      },
      {
        id: 'invest-goal',
        title: 'Create investing goal',
        description: 'Set your monthly investing goal in the Budget wallet card.',
        completed: Boolean(investingWallet && investingWallet.monthlyGoal > 0),
        href: '/budget',
      },
      {
        id: 'invest-deposit',
        title: 'Deposit to investing account',
        description: 'Add funds into your RON investing wallet.',
        completed: hasDepositOrAutoFund,
        href: '/budget',
      },
      {
        id: 'invest-convert',
        title: 'Convert RON to EUR',
        description: 'Move wallet funds to investing cash (EUR).',
        completed: hasConvertToEur,
        href: '/budget',
      },
      {
        id: 'first-crypto-trade',
        title: 'Make your first crypto trade',
        description: 'Buy or sell an asset in the Invest section.',
        completed: cryptoTradesCount > 0,
        href: '/invest/discovery',
      },
      {
        id: 'quiz-complete',
        title: 'Complete 1 quiz',
        description: 'Finish a quiz in Learning Center to track progress.',
        completed: (learningProgress?.recentAttempts?.length ?? 0) > 0,
        href: '/learn',
      },
    ],
    [
      activeProfile?.monthlyBudgetGoal,
      allTimeTransactionsCount,
      cryptoTradesCount,
      hasConvertToEur,
      hasDepositOrAutoFund,
      investingWallet,
      learningProgress?.recentAttempts,
    ],
  );

  const onboardingCompletedCount = onboardingItems.filter((item) => item.completed).length;
  const shouldShowOnboarding = !onboardingDismissed && onboardingCompletedCount < onboardingItems.length;

  const handleCreateTransaction = async (payload: {
    type: 'income' | 'expense';
    amount: number;
    categoryId: string;
    date: string;
    description: string;
    isRecurring: boolean;
    recurrence: RecurrenceValue;
    recurrenceEndDate: string | null;
  }) => {
    if (!accessToken) {
      throw new Error('You must be logged in to add a transaction.');
    }

    setIsSavingTransaction(true);

    try {
      await createTransaction(payload, accessToken);
      setIsTransactionModalOpen(false);
      await loadHomeData();
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const retryAllWidgets = () => {
    void loadHomeData();
  };

  return (
    <AppShell activeTab="home">
      <div className="fv-page space-y-6 rounded-3xl p-1">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb]">Home</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Home</h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">Your financial overview in one place.</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setIsTransactionModalOpen(true)}
              disabled={!canAddTransaction}
              className="w-full rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Transaction
            </button>
            <Link
              to="/finny"
              className="fv-secondary-btn w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
            >
              Ask Finny
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <KpiSkeleton key={index} />)
          ) : (
            <>
              <article className="flex min-h-[11.25rem] flex-col rounded-[1.25rem] fv-card p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
                <p className="text-sm text-slate-500 dark:text-slate-400">Income (this month)</p>
                <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-emerald-600">
                  {formatMoney(budgetSummary.income, budgetDisplayCurrency)}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total received</p>
                {budgetSummary.income <= 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Add your first transaction.</p>
                ) : null}
              </article>

              <article className="flex min-h-[11.25rem] flex-col rounded-[1.25rem] fv-card p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
                <p className="text-sm text-slate-500 dark:text-slate-400">Expenses (this month)</p>
                <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-rose-600">
                  {formatMoney(budgetSummary.expenses, budgetDisplayCurrency)}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total spent</p>
                {budgetSummary.expenses <= 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Add your first transaction.</p>
                ) : null}
              </article>

              <article className="flex min-h-[11.25rem] flex-col rounded-[1.25rem] fv-card p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
                <p className="text-sm text-slate-500 dark:text-slate-400">Remaining Budget</p>
                {budgetSummary.budgetGoal === null ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Set budget to see remaining.</p>
                    <Link to="/budget" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                      Set budget
                    </Link>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                      {formatMoney(budgetSummary.remainingBudget ?? 0, budgetDisplayCurrency)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Goal: {formatMoney(budgetSummary.budgetGoal, budgetDisplayCurrency)}
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-[#f97316]"
                        style={{ width: `${Math.max(0, Math.min(100, budgetSummary.percentSpent ?? 0))}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {`${Math.round(budgetSummary.percentSpent ?? 0)}% spent`}
                    </p>
                  </>
                )}
              </article>

              <article className="flex min-h-[11.25rem] flex-col rounded-[1.25rem] fv-card p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
                <p className="text-sm text-slate-500 dark:text-slate-400">Portfolio Value</p>
                <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                  {formatMoney(portfolioSummary.totalValue, portfolioDisplayCurrency)}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Crypto + Stocks (EUR)</p>
                {portfolioSummary.totalValue <= 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Make your first trade.</p>
                ) : null}
              </article>
            </>
          )}
        </section>

        {shouldShowOnboarding ? (
          <OnboardingChecklistCard
            items={onboardingItems}
            onDismiss={() => setOnboardingDismissed(true)}
          />
        ) : null}

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[1.5rem] fv-card p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Spending by Category</h2>
              <Link to="/budget" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Open Budget
              </Link>
            </div>
            {isLoading ? (
              <div className="mt-6 h-52 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ) : widgetErrors.budget ? (
              <div className="mt-4">
                <p className="text-sm text-rose-600">{widgetErrors.budget}</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : budgetSummary.donutSlices.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                No transactions yet. Add a transaction to see your chart.
              </p>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center">
                <div className="relative mx-auto h-44 w-44 rounded-full" style={{ background: buildDonutBackground(budgetSummary.donutSlices) }}>
                  <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white dark:bg-slate-900 text-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Total</span>
                    <span className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(budgetSummary.expenses, budgetDisplayCurrency)}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {budgetSummary.donutSlices.map((slice) => {
                    const percentage =
                      budgetSummary.expenses > 0 ? (slice.value / budgetSummary.expenses) * 100 : 0;

                    return (
                      <div key={slice.label} className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                          <span>{slice.label}</span>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{Math.round(percentage)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[1.5rem] fv-card p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Portfolio Snapshot</h2>
              <Link to="/invest" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Open Invest
              </Link>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : widgetErrors.invest ? (
              <div className="mt-4">
                <p className="text-sm text-rose-600">{widgetErrors.invest}</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : !portfolioSummary.hasAnyPortfolioData ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                No trades yet. Start in Invest (Crypto) or Market (Stocks).
              </p>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total value</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(portfolioSummary.totalValue, portfolioDisplayCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Cash</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(portfolioSummary.cashBalance, portfolioDisplayCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Top holding</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {topHolding ? `${topHolding.symbol} (${formatPct(topHolding.allocationPct, 1)})` : 'No holdings yet'}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Market Snapshot</h3>
                <Link to="/market" className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                  Open Market
                </Link>
              </div>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  ))}
                </div>
              ) : widgetErrors.market ? (
                <div>
                  <p className="text-sm text-rose-600">{widgetErrors.market}</p>
                  <RetryButton onRetry={retryAllWidgets} />
                </div>
              ) : marketQuotes.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No market snapshot yet.</p>
              ) : (
                <div className="space-y-2">
                  {marketQuotes.slice(0, 5).map((quote) => (
                    <div key={quote.symbol} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{quote.symbol}</span>
                      <span
                        className={[
                          'font-semibold',
                          typeof quote.changePct === 'number' && quote.changePct < 0
                            ? 'text-rose-600'
                            : 'text-emerald-600',
                        ].join(' ')}
                      >
                        {formatPct(quote.changePct, 2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-4">
          <article className="rounded-[1.5rem] fv-card p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Finny Insights</h2>
              <Link to="/finny" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Ask Finny
              </Link>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : widgetErrors.insights ? (
              <div className="mt-4">
                <p className="text-sm text-rose-600">{widgetErrors.insights}</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : insights.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                No active insights right now.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {insights.slice(0, 3).map((insight) => (
                  <article key={insight.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/70 dark:bg-amber-950/30">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {insight.whatNoticed || insight.message || insight.whyMatters}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      {insight.actions?.[0]?.href ? (
                        <Link
                          to={insight.actions[0].href}
                          className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
                        >
                          {insight.actions[0].label}
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          void handleDismissInsight(insight.id);
                        }}
                        disabled={dismissingInsightId === insight.id}
                        className="text-xs font-semibold text-slate-500 dark:text-slate-300 transition hover:text-slate-700 dark:hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {dismissingInsightId === insight.id ? 'Dismissing...' : 'Dismiss'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-[1.5rem] fv-card p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Transactions</h2>
              <Link to="/budget" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Open Budget
              </Link>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : widgetErrors.budget ? (
              <div className="mt-4">
                <p className="text-sm text-rose-600">{widgetErrors.budget}</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : budgetSummary.recentTransactions.length === 0 ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60" />
                ))}
                <button
                  type="button"
                  onClick={() => setIsTransactionModalOpen(true)}
                  className="fv-secondary-btn inline-flex rounded-lg px-3 py-2 text-sm font-semibold"
                >
                  Add Transaction
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {budgetSummary.recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {transaction.description || transaction.category?.name || 'Transaction'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatTransactionDate(transaction.date)}</p>
                    </div>
                    <span
                      className={[
                        'text-sm font-semibold',
                        transaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600',
                      ].join(' ')}
                    >
                      {transaction.type === 'income' ? '+' : '-'}
                      {formatMoney(transaction.amount, budgetDisplayCurrency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-[1.5rem] fv-card p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Latest News</h2>
              <Link to="/news" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Open News
              </Link>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : widgetErrors.news ? (
              <div className="mt-4">
                <p className="text-sm text-rose-600">{widgetErrors.news}</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : newsItems.length === 0 ? (
              <div className="mt-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">No news loaded. Try again.</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {newsItems.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => window.open(article.url, '_blank', 'noopener,noreferrer')}
                    className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{article.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {article.source} • {new Date(article.publishedAt || Date.now()).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-[1.5rem] fv-card p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Learning Progress</h2>
              <Link to="/learn" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Open Learning
              </Link>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : widgetErrors.learn ? (
              <div className="mt-4">
                <p className="text-sm text-rose-600">{widgetErrors.learn}</p>
                <RetryButton onRetry={retryAllWidgets} />
              </div>
            ) : !lastQuizAttempt ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Start your first quiz to track progress.</p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-sm text-slate-500 dark:text-slate-400">XP</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{learningProgress?.xp ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Level</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{learningProgress?.level ?? 1}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Streak</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {`${learningProgress?.streakDays ?? 0} days`}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm">
                  <p className="text-slate-500 dark:text-slate-400">Last quiz score</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {lastQuizAttempt ? `${lastQuizAttempt.score}%` : 'No attempts yet'}
                  </p>
                </div>
              </div>
            )}
          </article>
        </section>
      </div>

      <AddTransactionModal
        isOpen={isTransactionModalOpen}
        mode="create"
        categories={categories}
        isSubmitting={isSavingTransaction}
        onClose={() => {
          if (!isSavingTransaction) {
            setIsTransactionModalOpen(false);
          }
        }}
        onSubmit={handleCreateTransaction}
      />
    </AppShell>
  );
}
