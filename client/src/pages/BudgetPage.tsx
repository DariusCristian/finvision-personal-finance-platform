import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddTransactionModal } from '../components/AddTransactionModal';
import { AppShell } from '../components/AppShell';
import { CategoryDonutChart } from '../components/CategoryDonutChart';
import { InvestingWalletConvertModal } from '../components/InvestingWalletConvertModal';
import { InvestingWalletDepositModal } from '../components/InvestingWalletDepositModal';
import { KpiCard } from '../components/KpiCard';
import { ManageInvestingWalletModal } from '../components/ManageInvestingWalletModal';
import { SetBudgetModal } from '../components/SetBudgetModal';
import { TransactionsTable } from '../components/TransactionsTable';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  createTransaction,
  depositInvestingWallet,
  deleteTransaction,
  exportBudgetCsv,
  fetchCategories,
  fetchBudgetSummary,
  fetchInvestingWallet,
  fetchInvestingWalletConvertQuote,
  fetchInvestingWalletSummary,
  fetchTransactions,
  topUpInvestCryptoFromWallet,
  updateTransaction,
  updateInvestingWallet,
  updateMonthlyBudgetGoal,
  type BudgetCategory,
  type BudgetSummary,
  type BudgetTransaction,
  type InvestingWallet,
  type InvestingWalletConvertQuote,
  type InvestingWalletSummary,
} from '../lib/api';

type RecurrenceValue = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
type SortOption = 'date' | '-date' | 'amount' | '-amount';
type ChipTone = 'positive' | 'negative' | 'neutral';

type CreateTransactionArgs = {
  type: 'income' | 'expense';
  amount: number;
  categoryId: string;
  date: string;
  description: string;
  isRecurring: boolean;
  recurrence: RecurrenceValue;
  recurrenceEndDate: string | null;
};

const MOCK_CATEGORIES: BudgetCategory[] = [
  { id: 'mock-entertainment', name: 'Entertainment', slug: 'entertainment', color: '#A855F7', kind: 'expense' },
  { id: 'mock-food', name: 'Food & Dining', slug: 'food-dining', color: '#3B82F6', kind: 'expense' },
  { id: 'mock-housing', name: 'Housing', slug: 'housing', color: '#2563EB', kind: 'expense' },
  { id: 'mock-income', name: 'Income', slug: 'income', color: '#10B981', kind: 'income' },
  { id: 'mock-investing', name: 'Investing', slug: 'investing', color: '#0EA5A4', kind: 'expense' },
  { id: 'mock-others', name: 'Others', slug: 'others', color: '#CBD5E1', kind: 'both' },
  { id: 'mock-transport', name: 'Transport', slug: 'transport', color: '#FB923C', kind: 'expense' },
];

function BankIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="m4 10 8-4 8 4" />
      <path d="M6 10v6" />
      <path d="M10 10v6" />
      <path d="M14 10v6" />
      <path d="M18 10v6" />
      <path d="M4 18h16" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4.5 8A2.5 2.5 0 0 1 7 5.5h8A2.5 2.5 0 0 1 17.5 8v8A2.5 2.5 0 0 1 15 18.5H7A2.5 2.5 0 0 1 4.5 16Z" />
      <path d="M15 10.5h4v3h-4a1.5 1.5 0 0 1 0-3Z" />
      <circle cx="15.8" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DonutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 4a8 8 0 1 0 8 8" />
      <path d="M12 4a8 8 0 0 1 8 8h-8Z" />
    </svg>
  );
}

const getMonthKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });
};

const buildMonthOptions = (previousCount: number, futureCount: number) => {
  const now = new Date();
  const offsets = Array.from({ length: previousCount + futureCount + 1 }, (_, index) => index - previousCount);

  return offsets.map((offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = getMonthKey(date);

    return {
      value,
      label: formatMonthLabel(value),
    };
  });
};

const getMonthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNumber, 0));

  const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    from: toIsoDate(startDate),
    to: toIsoDate(endDate),
  };
};

const buildBudgetSummaryFromTransactions = ({
  transactions,
  year,
  month,
  currency,
  budgetGoal,
}: {
  transactions: BudgetTransaction[];
  year: number;
  month: number;
  currency: 'RON' | 'EUR' | 'USD';
  budgetGoal: number;
}): BudgetSummary => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  const totals = transactions.reduce(
    (accumulator, transaction) => {
      const amount = Math.abs(Number(transaction.amount || 0));

      if (!Number.isFinite(amount) || amount <= 0) {
        return accumulator;
      }

      if (transaction.type === 'income') {
        accumulator.income += amount;
        return accumulator;
      }

      if (transaction.type === 'expense') {
        accumulator.expense += amount;
      }

      return accumulator;
    },
    { income: 0, expense: 0 },
  );

  const normalizedBudgetGoal = Number.isFinite(budgetGoal) && budgetGoal > 0 ? budgetGoal : 0;

  return {
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    currency,
    budgetGoal: normalizedBudgetGoal,
    incomeTotal: totals.income,
    expenseTotal: totals.expense,
    remainingBudget: Math.max(0, normalizedBudgetGoal - totals.expense),
  };
};

const formatCurrency = (
  value: number,
  fractionDigits = 2,
  currency: 'RON' | 'EUR' | 'USD' = 'RON',
) => {
  const normalizedCurrency = String(currency || 'RON').trim().toUpperCase();
  const safeCurrency =
    normalizedCurrency === 'RON' || normalizedCurrency === 'EUR' || normalizedCurrency === 'USD'
      ? normalizedCurrency
      : 'RON';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const downloadCsvBlob = (blob: Blob, filename: string) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const addMonths = (date: Date, count: number) => {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCMonth(nextDate.getUTCMonth() + count);
  return nextDate;
};

const addYears = (date: Date, count: number) => {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + count);
  return nextDate;
};

const findCategory = (categories: BudgetCategory[], slug: string) =>
  categories.find((category) => category.slug === slug) ?? null;

const buildMockTransactions = (
  selectedMonth: string,
  categories: BudgetCategory[],
): BudgetTransaction[] => {
  const [year, month] = selectedMonth.split('-').map(Number);
  const selectedMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const selectedMonthKey = getMonthKey(selectedMonthDate);
  const currentMonthKey = getMonthKey(new Date());
  const isProjectedMonth = selectedMonthKey !== currentMonthKey;

  const makeOccurrence = (
    id: string,
    day: number,
    hour: number,
    minute: number,
    options: {
      type: 'income' | 'expense';
      amount: number;
      description: string;
      categorySlug: string;
      isRecurring?: boolean;
      recurrence?: RecurrenceValue;
      recurrenceEndDate?: string | null;
      isProjected?: boolean;
    },
  ): BudgetTransaction => {
    const occurrenceDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const createdAt = new Date(occurrenceDate.getTime() + 60 * 1000);
    const recurrenceEndDate = options.recurrenceEndDate ?? null;

    return {
      id,
      originalTransactionId: id,
      sourceDate: occurrenceDate.toISOString(),
      type: options.type,
      amount: options.amount,
      date: occurrenceDate.toISOString(),
      occurrenceDate: occurrenceDate.toISOString(),
      description: options.description,
      createdAt: createdAt.toISOString(),
      isRecurring: Boolean(options.isRecurring),
      recurrence: options.recurrence ?? 'none',
      recurrenceEndDate,
      nextOccurrenceAt:
        options.isRecurring && recurrenceEndDate
          ? addMonths(occurrenceDate, 1).toISOString()
          : null,
      isProjected: Boolean(options.isProjected),
      category: findCategory(categories, options.categorySlug) ?? findCategory(categories, 'others'),
    };
  };

  return [
    makeOccurrence(`mock-${selectedMonth}-salary`, 2, 9, 0, {
      type: 'income',
      amount: 3250,
      description: 'Salary Deposit',
      categorySlug: 'income',
      isRecurring: true,
      recurrence: 'monthly',
      recurrenceEndDate: addYears(selectedMonthDate, 1).toISOString(),
      isProjected: isProjectedMonth,
    }),
    makeOccurrence(`mock-${selectedMonth}-rent`, 1, 8, 0, {
      type: 'expense',
      amount: 1225,
      description: 'Rent Payment',
      categorySlug: 'housing',
      isRecurring: true,
      recurrence: 'monthly',
      recurrenceEndDate: addYears(selectedMonthDate, 1).toISOString(),
      isProjected: isProjectedMonth,
    }),
    makeOccurrence(`mock-${selectedMonth}-investing`, 6, 10, 0, {
      type: 'expense',
      amount: 250,
      description: 'Brokerage Contribution',
      categorySlug: 'investing',
      isRecurring: true,
      recurrence: 'monthly',
      recurrenceEndDate: addYears(selectedMonthDate, 1).toISOString(),
      isProjected: isProjectedMonth,
    }),
    makeOccurrence(`mock-${selectedMonth}-groceries`, 5, 10, 23, {
      type: 'expense',
      amount: 84.5,
      description: 'Grocery Store',
      categorySlug: 'food-dining',
    }),
    makeOccurrence(`mock-${selectedMonth}-uber`, 9, 13, 10, {
      type: 'expense',
      amount: 24.5,
      description: 'Uber Trip',
      categorySlug: 'transport',
    }),
    makeOccurrence(`mock-${selectedMonth}-streaming`, 7, 20, 5, {
      type: 'expense',
      amount: 15.99,
      description: 'Netflix Subscription',
      categorySlug: 'entertainment',
      isRecurring: true,
      recurrence: 'monthly',
      recurrenceEndDate: addYears(selectedMonthDate, 1).toISOString(),
      isProjected: isProjectedMonth,
    }),
  ].sort((left, right) => new Date(right.occurrenceDate).getTime() - new Date(left.occurrenceDate).getTime());
};

const getPreviousMonthKey = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return getMonthKey(date);
};

const getDeltaPercent = (current: number, previous: number) => {
  if (!Number.isFinite(previous) || previous === 0) {
    return null;
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;

  if (!Number.isFinite(delta)) {
    return null;
  }

  return delta;
};

const chipToneClassMap: Record<ChipTone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  negative: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const getDeltaTone = (value: number): ChipTone => {
  if (value > 0) {
    return 'positive';
  }

  if (value < 0) {
    return 'negative';
  }

  return 'neutral';
};

const getSpentTone = (value: number): ChipTone => {
  if (value > 100) {
    return 'negative';
  }

  if (value < 50) {
    return 'positive';
  }

  return 'neutral';
};

const renderChip = (label: string, tone: ChipTone) => (
  <span
    className={[
      'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
      chipToneClassMap[tone],
    ].join(' ')}
  >
    {label}
  </span>
);

const sortTransactionsByOption = (
  items: BudgetTransaction[],
  sortOption: SortOption,
) => [...items].sort((left, right) => {
  if (sortOption === 'amount' || sortOption === '-amount') {
    if (left.amount !== right.amount) {
      return sortOption === 'amount' ? left.amount - right.amount : right.amount - left.amount;
    }
  } else {
    const leftDate = new Date(left.occurrenceDate).getTime();
    const rightDate = new Date(right.occurrenceDate).getTime();

    if (leftDate !== rightDate) {
      return sortOption === 'date' ? leftDate - rightDate : rightDate - leftDate;
    }
  }

  const leftCreatedAt = new Date(left.createdAt).getTime();
  const rightCreatedAt = new Date(right.createdAt).getTime();

  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  if (left.isProjected !== right.isProjected) {
    return Number(left.isProjected) - Number(right.isProjected);
  }

  return left.id.localeCompare(right.id);
});

export function BudgetPage() {
  const { accessToken, setCurrentUser, user } = useAuth();
  const monthOptions = useMemo(() => buildMonthOptions(5, 12), []);
  const currentMonth = getMonthKey(new Date());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [sortOption, setSortOption] = useState<SortOption>('-date');
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [previousMonthTransactions, setPreviousMonthTransactions] = useState<BudgetTransaction[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [previousMonthBudgetSummary, setPreviousMonthBudgetSummary] = useState<BudgetSummary | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isWalletSettingsModalOpen, setIsWalletSettingsModalOpen] = useState(false);
  const [isWalletDepositModalOpen, setIsWalletDepositModalOpen] = useState(false);
  const [isWalletConvertModalOpen, setIsWalletConvertModalOpen] = useState(false);
  const [walletConvertInputAmount, setWalletConvertInputAmount] = useState(0);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [isSavingBudgetGoal, setIsSavingBudgetGoal] = useState(false);
  const [isSavingWalletSettings, setIsSavingWalletSettings] = useState(false);
  const [isDepositingWalletFunds, setIsDepositingWalletFunds] = useState(false);
  const [isConvertingWalletFunds, setIsConvertingWalletFunds] = useState(false);
  const [isExportingBudgetCsv, setIsExportingBudgetCsv] = useState(false);
  const [isLoadingWalletQuote, setIsLoadingWalletQuote] = useState(false);
  const [walletQuoteError, setWalletQuoteError] = useState<string | null>(null);
  const [walletConvertQuote, setWalletConvertQuote] = useState<InvestingWalletConvertQuote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const [investingWallet, setInvestingWallet] = useState<InvestingWallet | null>(null);
  const [investingWalletSummary, setInvestingWalletSummary] = useState<InvestingWalletSummary | null>(null);
  const budgetCurrency: 'RON' | 'EUR' | 'USD' = user?.baseCurrency ?? 'RON';
  const selectedMonthParts = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);

    return {
      year,
      month,
    };
  }, [selectedMonth]);

  const loadBudgetData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const range = getMonthRange(selectedMonth);
    const previousMonthKey = getPreviousMonthKey(selectedMonth);
    const previousRange = getMonthRange(previousMonthKey);
    const [previousYear, previousMonthNumber] = previousMonthKey.split('-').map(Number);

    try {
      const [
        categoriesPayload,
        transactionsPayload,
        previousTransactionsPayload,
        budgetSummaryPayload,
        previousBudgetSummaryPayload,
        walletPayload,
        walletSummaryPayload,
      ] = await Promise.all([
        fetchCategories(accessToken),
        fetchTransactions({ ...range, sort: sortOption }, accessToken),
        fetchTransactions({ ...previousRange, sort: sortOption }, accessToken),
        fetchBudgetSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
        fetchBudgetSummary(accessToken, previousYear, previousMonthNumber),
        fetchInvestingWallet(accessToken),
        fetchInvestingWalletSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
      ]);

      setCategories(categoriesPayload.categories);
      setTransactions(sortTransactionsByOption(transactionsPayload.transactions, sortOption));
      setPreviousMonthTransactions(
        sortTransactionsByOption(previousTransactionsPayload.transactions, sortOption),
      );
      setBudgetSummary(budgetSummaryPayload);
      setPreviousMonthBudgetSummary(previousBudgetSummaryPayload);
      setInvestingWallet(walletPayload);
      setInvestingWalletSummary(walletSummaryPayload);
      setIsUsingMockData(false);
    } catch {
      const fallbackCategories = MOCK_CATEGORIES;
      const fallbackTransactions = sortTransactionsByOption(
        buildMockTransactions(selectedMonth, fallbackCategories),
        sortOption,
      );
      const fallbackPreviousTransactions = sortTransactionsByOption(
        buildMockTransactions(previousMonthKey, fallbackCategories),
        sortOption,
      );
      const fallbackBudgetGoal =
        typeof user?.monthlyBudgetGoal === 'number' && user.monthlyBudgetGoal > 0
          ? user.monthlyBudgetGoal
          : 0;
      const fallbackCurrency = user?.baseCurrency ?? 'RON';

      setCategories(fallbackCategories);
      setTransactions(fallbackTransactions);
      setPreviousMonthTransactions(fallbackPreviousTransactions);
      setBudgetSummary(
        buildBudgetSummaryFromTransactions({
          transactions: fallbackTransactions,
          year: selectedMonthParts.year,
          month: selectedMonthParts.month,
          currency: fallbackCurrency,
          budgetGoal: fallbackBudgetGoal,
        }),
      );
      setPreviousMonthBudgetSummary(
        buildBudgetSummaryFromTransactions({
          transactions: fallbackPreviousTransactions,
          year: previousYear,
          month: previousMonthNumber,
          currency: fallbackCurrency,
          budgetGoal: fallbackBudgetGoal,
        }),
      );
      setInvestingWallet(null);
      setInvestingWalletSummary(null);
      setIsUsingMockData(true);
      setLoadError('Live API unavailable. Showing demo fallback data.');
    } finally {
      setIsLoading(false);
    }
  }, [
    accessToken,
    selectedMonth,
    selectedMonthParts.month,
    selectedMonthParts.year,
    sortOption,
    user?.baseCurrency,
    user?.monthlyBudgetGoal,
  ]);

  useEffect(() => {
    void loadBudgetData();
  }, [loadBudgetData]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  const visibleTransactions = useMemo(() => {
    const term = searchValue.trim().toLowerCase();

    const filteredTransactions = !term
      ? transactions
      : transactions.filter((transaction) => {
      const haystacks = [transaction.description, transaction.category?.name ?? '', transaction.type]
        .join(' ')
        .toLowerCase();

      return haystacks.includes(term);
    });

    return sortTransactionsByOption(filteredTransactions, sortOption);
  }, [searchValue, sortOption, transactions]);

  const metrics = useMemo(() => {
    const fallbackIncome = transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const fallbackExpenses = transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const fallbackPreviousIncome = previousMonthTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const fallbackPreviousExpenses = previousMonthTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const income = budgetSummary?.incomeTotal ?? fallbackIncome;
    const expenses = budgetSummary?.expenseTotal ?? fallbackExpenses;
    const previousIncome = previousMonthBudgetSummary?.incomeTotal ?? fallbackPreviousIncome;
    const previousExpenses = previousMonthBudgetSummary?.expenseTotal ?? fallbackPreviousExpenses;
    const monthlyBudgetGoalRaw =
      budgetSummary?.budgetGoal ??
      (typeof user?.monthlyBudgetGoal === 'number' && user.monthlyBudgetGoal > 0
        ? user.monthlyBudgetGoal
        : 0);
    const monthlyBudgetGoal = monthlyBudgetGoalRaw > 0 ? monthlyBudgetGoalRaw : null;
    const previousTotalBalance = previousIncome - previousExpenses;
    const totalBalance = income - expenses;
    const remainingBudget =
      budgetSummary?.remainingBudget ??
      (monthlyBudgetGoal !== null ? Math.max(0, monthlyBudgetGoal - expenses) : null);
    const percentSpent =
      monthlyBudgetGoal && monthlyBudgetGoal > 0
        ? Math.round((expenses / monthlyBudgetGoal) * 100)
        : null;
    const balanceDeltaPct = getDeltaPercent(totalBalance, previousTotalBalance);
    const incomeDeltaPct = getDeltaPercent(income, previousIncome);
    const investingGoal = investingWallet?.monthlyGoal ?? 0;
    const investedThisMonth = investingWalletSummary?.investedThisMonthRON ?? 0;
    const investingProgress =
      investingGoal > 0 ? Math.round((investedThisMonth / investingGoal) * 100) : null;
    const investingAccountBalance = investingWallet?.balance ?? 0;

    return {
      income,
      expenses,
      totalBalance,
      balanceDeltaPct,
      monthlyBudgetGoal,
      remainingBudget,
      percentSpent,
      incomeDeltaPct,
      investingGoal,
      investedThisMonth,
      investingProgress,
      investingAccountBalance,
    };
  }, [
    budgetSummary,
    investingWallet,
    investingWalletSummary,
    previousMonthBudgetSummary,
    previousMonthTransactions,
    transactions,
    user,
  ]);

  const categorySpend = useMemo(() => {
    const grouped = new Map<string, { label: string; value: number; color: string }>();

    transactions.forEach((transaction) => {
      if (transaction.type !== 'expense') {
        return;
      }

      const label = transaction.category?.name ?? 'Others';
      const color = transaction.category?.color ?? '#CBD5E1';
      const existing = grouped.get(label);

      if (existing) {
        existing.value += transaction.amount;
        return;
      }

      grouped.set(label, { label, value: transaction.amount, color });
    });

    return Array.from(grouped.values()).sort((left, right) => right.value - left.value);
  }, [transactions]);

  const handleSaveTransaction = async (payload: CreateTransactionArgs) => {
    if (!accessToken) {
      throw new Error('You need to be logged in to add transactions.');
    }

    setIsSavingTransaction(true);

    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.originalTransactionId, payload, accessToken);
      } else {
        await createTransaction(payload, accessToken);
      }

      setEditingTransaction(null);
      setIsModalOpen(false);
      await loadBudgetData();
    } catch (error) {
      if (isUsingMockData) {
        const category = categories.find((item) => item.id === payload.categoryId) ?? null;
        const normalizedDate = new Date(`${payload.date}T12:00:00.000Z`);
        if (editingTransaction) {
          setTransactions((current) =>
            current.map((transaction) =>
              transaction.originalTransactionId !== editingTransaction.originalTransactionId
                ? transaction
                : {
                    ...transaction,
                    type: payload.type,
                    amount: payload.amount,
                    description: payload.description,
                    isRecurring: payload.isRecurring,
                    recurrence: payload.recurrence,
                    recurrenceEndDate: payload.recurrenceEndDate,
                    nextOccurrenceAt: payload.isRecurring
                      ? addMonths(normalizedDate, 1).toISOString()
                      : null,
                    category,
                    sourceDate: normalizedDate.toISOString(),
                    ...(transaction.id === editingTransaction.id
                      ? {
                          date: normalizedDate.toISOString(),
                          occurrenceDate: normalizedDate.toISOString(),
                        }
                      : {}),
                  },
            ),
          );
        } else {
          const mockId = `mock-new-${Date.now()}`;
          const mockTransaction: BudgetTransaction = {
            id: mockId,
            originalTransactionId: mockId,
            sourceDate: normalizedDate.toISOString(),
            type: payload.type,
            amount: payload.amount,
            date: normalizedDate.toISOString(),
            occurrenceDate: normalizedDate.toISOString(),
            description: payload.description,
            createdAt: new Date().toISOString(),
            isRecurring: payload.isRecurring,
            recurrence: payload.recurrence,
            recurrenceEndDate: payload.recurrenceEndDate,
            nextOccurrenceAt: payload.isRecurring ? addMonths(normalizedDate, 1).toISOString() : null,
            isProjected: false,
            category,
          };

          setTransactions((current) => [mockTransaction, ...current]);
        }

        setBudgetSummary(null);
        setEditingTransaction(null);
        setIsModalOpen(false);
        setLoadError(
          editingTransaction
            ? 'Changes saved locally in demo mode because the live API is unavailable.'
            : 'Saved locally in demo mode because the live API is unavailable.',
        );
        return;
      }

      if (error instanceof ApiRequestError) {
        throw error;
      }

      throw new Error('Unable to create the transaction right now.');
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const handleEditTransaction = useCallback((transaction: BudgetTransaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  }, []);

  const handleDeleteTransaction = useCallback(async (transaction: BudgetTransaction) => {
    const targetLabel = transaction.isProjected
      ? 'this recurring source transaction'
      : 'this transaction';
    const confirmed = window.confirm(`Delete ${targetLabel}? This action cannot be undone.`);

    if (!confirmed || !accessToken) {
      return;
    }

    setIsSavingTransaction(true);

    try {
      await deleteTransaction(transaction.originalTransactionId, accessToken);

      if (editingTransaction?.originalTransactionId === transaction.originalTransactionId) {
        setEditingTransaction(null);
        setIsModalOpen(false);
      }

      await loadBudgetData();
    } catch (error) {
      if (isUsingMockData) {
        setTransactions((current) =>
          current.filter(
            (item) => item.originalTransactionId !== transaction.originalTransactionId,
          ),
        );
        setBudgetSummary(null);

        if (editingTransaction?.originalTransactionId === transaction.originalTransactionId) {
          setEditingTransaction(null);
          setIsModalOpen(false);
        }

        setLoadError('Deletion applied locally in demo mode because the live API is unavailable.');
        return;
      }

      if (error instanceof ApiRequestError) {
        setLoadError(error.message);
        return;
      }

      setLoadError('Unable to delete the transaction right now.');
    } finally {
      setIsSavingTransaction(false);
    }
  }, [
    accessToken,
    editingTransaction,
    isUsingMockData,
    loadBudgetData,
  ]);

  const handleBudgetSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleBudgetSortChange = useCallback((value: SortOption) => {
    setSortOption(value);
  }, []);

  const handleDeleteBudgetTransaction = useCallback((transaction: BudgetTransaction) => {
    void handleDeleteTransaction(transaction);
  }, [handleDeleteTransaction]);

  const handleSaveBudgetGoal = async (amount: number) => {
    if (!accessToken || !user) {
      throw new Error('You need to be logged in to update the monthly budget.');
    }

    setIsSavingBudgetGoal(true);

    try {
      const payload = await updateMonthlyBudgetGoal(amount, accessToken);
      setCurrentUser(payload.user);
      setIsBudgetModalOpen(false);
      await loadBudgetData();
    } catch (error) {
      if (isUsingMockData) {
        setCurrentUser({
          ...user,
          monthlyBudgetGoal: amount,
        });
        setBudgetSummary((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            budgetGoal: amount,
            remainingBudget: Math.max(0, amount - current.expenseTotal),
          };
        });
        setIsBudgetModalOpen(false);
        setLoadError('Budget goal saved locally in demo mode because the live API is unavailable.');
        return;
      }

      if (error instanceof ApiRequestError) {
        throw error;
      }

      throw new Error('Unable to save your monthly budget right now.');
    } finally {
      setIsSavingBudgetGoal(false);
    }
  };

  const handleSaveWalletSettings = async (payload: {
    monthlyGoal: number;
    autoFundEnabled: boolean;
    autoFundAmount: number;
    autoFundDayOfMonth: number;
  }) => {
    if (!accessToken) {
      throw new Error('You need to be logged in to update investing wallet settings.');
    }

    setIsSavingWalletSettings(true);

    try {
      const [walletPayload, walletSummaryPayload] = await Promise.all([
        updateInvestingWallet(payload, accessToken),
        fetchInvestingWalletSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
      ]);
      setInvestingWallet(walletPayload);
      setInvestingWalletSummary(walletSummaryPayload);
      setIsWalletSettingsModalOpen(false);
      setSuccessMessage('Investing wallet settings updated.');
    } catch (error) {
      if (isUsingMockData && investingWallet) {
        setInvestingWallet({
          ...investingWallet,
          ...payload,
        });
        setInvestingWalletSummary((current) => current ?? {
          investedThisMonthRON: 0,
          convertedToEurThisMonthRON: 0,
          monthStart: '',
          monthEnd: '',
        });
        setIsWalletSettingsModalOpen(false);
        setLoadError('Wallet settings saved locally in demo mode because the live API is unavailable.');
        return;
      }

      if (error instanceof ApiRequestError) {
        throw error;
      }

      throw new Error('Unable to save investing wallet settings right now.');
    } finally {
      setIsSavingWalletSettings(false);
    }
  };

  const handleDepositWalletFunds = async (payload: { amountRON: number; note?: string }) => {
    if (!accessToken) {
      throw new Error('You need to be logged in to add funds.');
    }

    setIsDepositingWalletFunds(true);

    try {
      const [walletPayload, walletSummaryPayload] = await Promise.all([
        depositInvestingWallet(payload, accessToken),
        fetchInvestingWalletSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
      ]);
      setInvestingWallet(walletPayload);
      setInvestingWalletSummary(walletSummaryPayload);
      setIsWalletDepositModalOpen(false);
      setSuccessMessage(`Added ${formatCurrency(payload.amountRON, 2, 'RON')} to investing wallet.`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }

      throw new Error('Unable to add funds right now.');
    } finally {
      setIsDepositingWalletFunds(false);
    }
  };

  useEffect(() => {
    if (!isWalletConvertModalOpen || !accessToken) {
      return;
    }

    if (!Number.isFinite(walletConvertInputAmount) || walletConvertInputAmount <= 0) {
      setWalletConvertQuote(null);
      setWalletQuoteError(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLoadingWalletQuote(true);
      setWalletQuoteError(null);

      void fetchInvestingWalletConvertQuote(walletConvertInputAmount, accessToken)
        .then((quotePayload) => {
          setWalletConvertQuote(quotePayload);
        })
        .catch((error) => {
          setWalletConvertQuote(null);
          setWalletQuoteError(
            error instanceof ApiRequestError
              ? error.message
              : 'Unable to fetch conversion quote right now.',
          );
        })
        .finally(() => {
          setIsLoadingWalletQuote(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, isWalletConvertModalOpen, walletConvertInputAmount]);

  const handleConvertWalletFunds = async (amountRON: number) => {
    if (!accessToken) {
      throw new Error('You need to be logged in to convert funds.');
    }

    setIsConvertingWalletFunds(true);

    try {
      const conversionPayload = await topUpInvestCryptoFromWallet(amountRON, accessToken);
      const [walletPayload, walletSummaryPayload] = await Promise.all([
        fetchInvestingWallet(accessToken),
        fetchInvestingWalletSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
      ]);

      setInvestingWallet(walletPayload);
      setInvestingWalletSummary(walletSummaryPayload);
      setIsWalletConvertModalOpen(false);
      setWalletConvertQuote(null);
      setWalletQuoteError(null);
      setSuccessMessage(
        `Converted ${formatCurrency(amountRON, 2, 'RON')} to ${formatCurrency(
          conversionPayload.addedEUR,
          2,
          'EUR',
        )} and added it to Invest cash.`,
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }

      throw new Error('Unable to convert funds right now.');
    } finally {
      setIsConvertingWalletFunds(false);
    }
  };

  const handleExportBudgetCsv = async () => {
    if (!accessToken || isExportingBudgetCsv) {
      return;
    }

    const { from, to } = getMonthRange(selectedMonth);
    setIsExportingBudgetCsv(true);
    setActionError(null);
    setSuccessMessage('Export started...');

    try {
      const { blob, filename } = await exportBudgetCsv({ from, to }, accessToken);
      downloadCsvBlob(blob, filename);
      setSuccessMessage('Budget CSV downloaded.');
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to export Budget CSV right now.',
      );
    } finally {
      setIsExportingBudgetCsv(false);
    }
  };

  const balanceBadge =
    typeof metrics.balanceDeltaPct === 'number'
      ? renderChip(
        `${metrics.balanceDeltaPct >= 0 ? '+' : ''}${metrics.balanceDeltaPct.toFixed(1)}% vs last month`,
        getDeltaTone(metrics.balanceDeltaPct),
      )
      : undefined;
  const incomeBadge =
    typeof metrics.incomeDeltaPct === 'number'
      ? renderChip(
        `${metrics.incomeDeltaPct >= 0 ? '+' : ''}${metrics.incomeDeltaPct.toFixed(1)}% vs last month`,
        getDeltaTone(metrics.incomeDeltaPct),
      )
      : undefined;
  const budgetBadge =
    typeof metrics.percentSpent === 'number'
      ? renderChip(
        `${Math.max(metrics.percentSpent, 0)}% spent`,
        getSpentTone(metrics.percentSpent),
      )
      : undefined;
  const hasBudgetGoal = metrics.monthlyBudgetGoal !== null;
  const remainingBudgetValue = hasBudgetGoal
    ? formatCurrency(metrics.remainingBudget ?? 0, 2, budgetCurrency)
    : 'Set budget';
  const remainingBudgetSubtitle = hasBudgetGoal
    ? `/ ${formatCurrency(metrics.monthlyBudgetGoal ?? 0, 0, budgetCurrency)}`
    : undefined;
  const remainingBudgetHelperText = hasBudgetGoal
    ? undefined
    : 'Set your monthly budget.';
  const remainingBudgetProgress = hasBudgetGoal
    ? Math.max(metrics.percentSpent ?? 0, 0)
    : undefined;
  const remainingBudgetBadge = hasBudgetGoal ? budgetBadge : undefined;
  const investingProgress = metrics.investingGoal > 0 ? Math.max(metrics.investingProgress ?? 0, 0) : null;

  return (
    <AppShell activeTab="budget">
      <div className="fv-page space-y-6 lg:space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Budget & Expenses</h1>
            <p className="mt-2 text-lg text-slate-500 dark:text-slate-400">
              Track your spending and manage your financial health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setIsBudgetModalOpen(true)}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              Set Budget
            </button>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isExportingBudgetCsv}
              onClick={() => {
                void handleExportBudgetCsv();
              }}
              className={[
                'inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition',
                isExportingBudgetCsv
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800',
              ].join(' ')}
            >
              {isExportingBudgetCsv ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              <span className="text-base leading-none">+</span>
              Add Transaction
            </button>
          </div>
        </header>

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {actionError}
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {loadError}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <KpiCard
            title="Total Balance"
            value={formatCurrency(metrics.totalBalance, 2, budgetCurrency)}
            icon={<BankIcon />}
            iconBgClassName="bg-blue-50"
            iconClassName="text-[#2563eb]"
            badge={balanceBadge}
          />
          <KpiCard
            title="Monthly Income"
            value={formatCurrency(metrics.income, 2, budgetCurrency)}
            icon={<WalletIcon />}
            iconBgClassName="bg-emerald-50"
            iconClassName="text-emerald-500"
            badge={incomeBadge}
          />
          <KpiCard
            title="Remaining Budget"
            value={remainingBudgetValue}
            subtitle={remainingBudgetSubtitle}
            helperText={remainingBudgetHelperText}
            icon={<DonutIcon />}
            iconBgClassName="bg-orange-50"
            iconClassName="text-orange-500"
            badge={remainingBudgetBadge}
            progressPercent={remainingBudgetProgress}
            progressColorClassName="bg-orange-500"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <TransactionsTable
            title="Recent Transactions"
            transactions={visibleTransactions}
            searchValue={searchValue}
            onSearchChange={handleBudgetSearchChange}
            sortOption={sortOption}
            onSortChange={handleBudgetSortChange}
            isLoading={isLoading}
            emptyMessage="No transactions match this month yet."
            heightClassName="h-[30rem] sm:h-[31rem] md:h-[32.5rem]"
            viewAllHref="/transactions"
            viewAllLabel="View all transactions"
            onEditTransaction={handleEditTransaction}
            onDeleteTransaction={handleDeleteBudgetTransaction}
            currency={budgetCurrency}
          />

          <div className="space-y-6 lg:col-span-4">
            <CategoryDonutChart
              slices={categorySpend}
              total={metrics.expenses}
              isLoading={isLoading}
              currency={budgetCurrency}
            />

            <section className="fv-card rounded-[1.5rem] p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Investing Account</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">RON wallet for funding your EUR investing portfolio.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsWalletSettingsModalOpen(true)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWalletDepositModalOpen(true)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Add Funds
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWalletQuoteError(null);
                      setWalletConvertQuote(null);
                      setIsWalletConvertModalOpen(true);
                    }}
                    className="inline-flex items-center rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
                  >
                    Convert to EUR
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Monthly investing goal</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.investingGoal, 2, 'RON')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Invested this month</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.investedThisMonth, 2, 'RON')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Account balance</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.investingAccountBalance, 2, 'RON')}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Auto-fund:{' '}
                {investingWallet?.autoFundEnabled
                  ? `${formatCurrency(investingWallet.autoFundAmount, 2, 'RON')} on day ${investingWallet.autoFundDayOfMonth}`
                  : 'Disabled'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Invested this month is based on deposits in the selected month.
              </p>

              {metrics.investingGoal > 0 ? (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    <span>Progress</span>
                    <span>{Math.min(investingProgress ?? 0, 999)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-[#0EA5A4]"
                      style={{ width: `${Math.max(0, Math.min(investingProgress ?? 0, 100))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Set a monthly investing goal to track progress.
                </p>
              )}
            </section>

          </div>
        </section>
      </div>

      <SetBudgetModal
        isOpen={isBudgetModalOpen}
        currentValue={user?.monthlyBudgetGoal ?? null}
        isSubmitting={isSavingBudgetGoal}
        onClose={() => setIsBudgetModalOpen(false)}
        onSubmit={handleSaveBudgetGoal}
      />

      <ManageInvestingWalletModal
        isOpen={isWalletSettingsModalOpen}
        currentValue={{
          monthlyGoal: investingWallet?.monthlyGoal ?? 0,
          autoFundEnabled: investingWallet?.autoFundEnabled ?? false,
          autoFundAmount: investingWallet?.autoFundAmount ?? 0,
          autoFundDayOfMonth: investingWallet?.autoFundDayOfMonth ?? 1,
        }}
        isSubmitting={isSavingWalletSettings}
        onClose={() => setIsWalletSettingsModalOpen(false)}
        onSubmit={handleSaveWalletSettings}
      />

      <InvestingWalletDepositModal
        isOpen={isWalletDepositModalOpen}
        isSubmitting={isDepositingWalletFunds}
        onClose={() => setIsWalletDepositModalOpen(false)}
        onSubmit={handleDepositWalletFunds}
      />

      <InvestingWalletConvertModal
        isOpen={isWalletConvertModalOpen}
        isSubmitting={isConvertingWalletFunds}
        walletBalanceRON={investingWallet?.balance ?? 0}
        quote={walletConvertQuote}
        isLoadingQuote={isLoadingWalletQuote}
        quoteError={walletQuoteError}
        onAmountChange={setWalletConvertInputAmount}
        onClose={() => setIsWalletConvertModalOpen(false)}
        onSubmit={handleConvertWalletFunds}
      />

      <AddTransactionModal
        isOpen={isModalOpen}
        mode={editingTransaction ? 'edit' : 'create'}
        initialTransaction={editingTransaction}
        categories={categories}
        isSubmitting={isSavingTransaction}
        onClose={() => {
          setEditingTransaction(null);
          setIsModalOpen(false);
        }}
        onSubmit={handleSaveTransaction}
      />
    </AppShell>
  );
}
