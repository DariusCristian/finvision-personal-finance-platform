import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AddTransactionModal } from '../components/AddTransactionModal';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  createTransaction,
  fetchCategories,
  fetchEducationProgress,
  fetchInvestHoldings,
  fetchNewsArticles,
  fetchProfile,
  fetchStockQuotes,
  fetchTransactions,
  type AuthUser,
  type BudgetCategory,
  type BudgetTransaction,
  type EducationProgress,
  type NewsArticle,
  type PortfolioHolding,
  type PortfolioTotals,
  type StockQuote,
} from '../lib/api';
import { formatMoney, formatPct } from '../lib/formatters';

type RecurrenceValue = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
type WidgetKey = 'budget' | 'invest' | 'market' | 'learn' | 'news';

const MARKET_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'];
const EMPTY_PORTFOLIO_TOTALS: PortfolioTotals = {
  cashBalance: 0,
  holdingsValue: 0,
  totalValue: 0,
  unrealizedPnL: 0,
  holdingsCount: 0,
};
const DONUT_COLORS = ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6', '#94a3b8'];

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

export function DashboardPage() {
  const { accessToken, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [widgetErrors, setWidgetErrors] = useState<Partial<Record<WidgetKey, string>>>({});
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [portfolioTotals, setPortfolioTotals] = useState<PortfolioTotals>(EMPTY_PORTFOLIO_TOTALS);
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<StockQuote[]>([]);
  const [learningProgress, setLearningProgress] = useState<EducationProgress | null>(null);
  const [newsItems, setNewsItems] = useState<NewsArticle[]>([]);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

  const loadHomeData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    const nextWidgetErrors: Partial<Record<WidgetKey, string>> = {};
    const { from, to } = getCurrentMonthRange();

    const [profileResult, categoriesResult, transactionsResult, investResult, marketResult, learnResult, newsResult] =
      await Promise.allSettled([
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
        fetchInvestHoldings(accessToken),
        fetchStockQuotes(MARKET_SYMBOLS, accessToken),
        fetchEducationProgress(accessToken),
        fetchNewsArticles({ topic: 'all', limit: 3, page: 1 }),
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

    if (transactionsResult.status === 'fulfilled') {
      setTransactions(transactionsResult.value.transactions);
    } else {
      setTransactions([]);
      nextWidgetErrors.budget = getErrorMessage(
        transactionsResult.reason,
        'Budget transactions are unavailable right now.',
      );
    }

    if (investResult.status === 'fulfilled') {
      setPortfolioTotals(investResult.value.totals);
      setPortfolioHoldings(investResult.value.holdings);
    } else {
      setPortfolioTotals(EMPTY_PORTFOLIO_TOTALS);
      setPortfolioHoldings([]);
      nextWidgetErrors.invest = getErrorMessage(
        investResult.reason,
        'Portfolio summary is unavailable right now.',
      );
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

    setWidgetErrors(nextWidgetErrors);
    setIsLoading(false);
  }, [accessToken, user]);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

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

  const topHolding = portfolioHoldings[0] ?? null;
  const lastQuizAttempt = learningProgress?.recentAttempts?.[0] ?? null;
  const canAddTransaction = categories.length > 0 && !isLoading && Boolean(accessToken);

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

  return (
    <AppShell activeTab="home">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb] dark:text-blue-400">Home</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Home</h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">Your financial overview in one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsTransactionModalOpen(true)}
              disabled={!canAddTransaction}
              className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              Add Transaction
            </button>
            <Link
              to="/assistant"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Ask Finny
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.25rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Income (this month)</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-emerald-600 dark:text-emerald-400">
              {isLoading ? '...' : formatMoney(budgetSummary.income, budgetDisplayCurrency)}
            </p>
          </article>

          <article className="rounded-[1.25rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Expenses (this month)</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-rose-600 dark:text-rose-400">
              {isLoading ? '...' : formatMoney(budgetSummary.expenses, budgetDisplayCurrency)}
            </p>
          </article>

          <article className="rounded-[1.25rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Remaining Budget</p>
            {budgetSummary.budgetGoal === null ? (
              <div className="mt-2 space-y-2">
                <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Set budget to see remaining.</p>
                <Link to="/budget" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                  Set budget
                </Link>
              </div>
            ) : (
              <>
                <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                  {isLoading ? '...' : formatMoney(budgetSummary.remainingBudget ?? 0, budgetDisplayCurrency)}
                </p>
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-2 rounded-full bg-[#f97316]"
                    style={{ width: `${Math.max(0, Math.min(100, budgetSummary.percentSpent ?? 0))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isLoading ? '...' : `${Math.round(budgetSummary.percentSpent ?? 0)}% spent`}
                </p>
              </>
            )}
          </article>

          <article className="rounded-[1.25rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Portfolio Value</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
              {isLoading ? '...' : formatMoney(portfolioTotals.totalValue, portfolioDisplayCurrency)}
            </p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Spending by Category</h2>
              <Link to="/budget" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                Open Budget
              </Link>
            </div>
            {widgetErrors.budget ? (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{widgetErrors.budget}</p>
            ) : isLoading ? (
              <div className="mt-6 h-52 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-700" />
            ) : budgetSummary.donutSlices.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">No expense activity yet for this month.</p>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center">
                <div className="relative mx-auto h-44 w-44 rounded-full" style={{ background: buildDonutBackground(budgetSummary.donutSlices) }}>
                  <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-slate-800">
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

          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Portfolio Snapshot</h2>
              <Link to="/invest" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                Open Portfolio
              </Link>
            </div>
            {widgetErrors.invest ? (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{widgetErrors.invest}</p>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total value</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {isLoading ? '...' : formatMoney(portfolioTotals.totalValue, portfolioDisplayCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Cash</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {isLoading ? '...' : formatMoney(portfolioTotals.cashBalance, portfolioDisplayCurrency)}
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

            <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Market Snapshot</h3>
                <Link to="/market" className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                  Open Market
                </Link>
              </div>
              {widgetErrors.market ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{widgetErrors.market}</p>
              ) : isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {marketQuotes.slice(0, 5).map((quote) => (
                    <div key={quote.symbol} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-700/60">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{quote.symbol}</span>
                      <span
                        className={[
                          'font-semibold',
                          typeof quote.changePct === 'number' && quote.changePct < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400',
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

        <section className="grid gap-6 xl:grid-cols-3">
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Transactions</h2>
              <Link to="/budget" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                Go to Budget
              </Link>
            </div>
            {widgetErrors.budget ? (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{widgetErrors.budget}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
                  ))
                ) : budgetSummary.recentTransactions.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No transactions this month yet.</p>
                ) : (
                  budgetSummary.recentTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/60">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {transaction.description || transaction.category?.name || 'Transaction'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatTransactionDate(transaction.date)}</p>
                      </div>
                      <span
                        className={[
                          'text-sm font-semibold',
                          transaction.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400',
                        ].join(' ')}
                      >
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatMoney(transaction.amount, budgetDisplayCurrency)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </article>

          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Latest News</h2>
              <Link to="/news" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                Open News
              </Link>
            </div>
            {widgetErrors.news ? (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">News unavailable.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
                  ))
                ) : newsItems.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No headlines available right now.</p>
                ) : (
                  newsItems.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => window.open(article.url, '_blank', 'noopener,noreferrer')}
                      className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:bg-slate-700/60 dark:hover:bg-slate-700"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{article.title}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {article.source} • {new Date(article.publishedAt || Date.now()).toLocaleDateString()}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </article>

          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Learning Progress</h2>
              <Link to="/learn" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
                Continue Learning
              </Link>
            </div>
            {widgetErrors.learn ? (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{widgetErrors.learn}</p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/60">
                  <span className="text-sm text-slate-500 dark:text-slate-400">XP</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {isLoading ? '...' : learningProgress?.xp ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/60">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Level</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {isLoading ? '...' : learningProgress?.level ?? 1}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/60">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Streak</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {isLoading ? '...' : `${learningProgress?.streakDays ?? 0} days`}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-600">
                  <p className="text-slate-500 dark:text-slate-400">Last quiz score</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {isLoading ? '...' : lastQuizAttempt ? `${lastQuizAttempt.score}%` : 'No attempts yet'}
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
