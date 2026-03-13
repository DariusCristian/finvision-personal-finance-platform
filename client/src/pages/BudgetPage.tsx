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
  convertInvestingWalletToEur,
  createTransaction,
  depositInvestingWallet,
  deleteTransaction,
  fetchCategories,
  fetchInvestAccount,
  fetchInvestingWallet,
  fetchInvestingWalletConvertQuote,
  fetchInvestingWalletSummary,
  fetchTransactions,
  updateTransaction,
  updateInvestingWallet,
  updateMonthlyBudgetGoal,
  type BudgetCategory,
  type BudgetTransaction,
  type InvestingWallet,
  type InvestingWalletConvertQuote,
  type InvestingWalletSummary,
} from '../lib/api';

type RecurrenceValue = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
type SortOption = 'date' | '-date' | 'amount' | '-amount';

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

const formatCurrency = (
  value: number,
  fractionDigits = 2,
  currency: 'RON' | 'EUR' | 'USD' = 'RON',
) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);

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

const makeProgressBadge = (label: string, className: string) => (
  <span className={className}>{label}</span>
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
  const [isLoadingWalletQuote, setIsLoadingWalletQuote] = useState(false);
  const [walletQuoteError, setWalletQuoteError] = useState<string | null>(null);
  const [walletConvertQuote, setWalletConvertQuote] = useState<InvestingWalletConvertQuote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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

    try {
      const [categoriesPayload, transactionsPayload, walletPayload, walletSummaryPayload] = await Promise.all([
        fetchCategories(accessToken),
        fetchTransactions({ ...range, sort: sortOption }, accessToken),
        fetchInvestingWallet(accessToken),
        fetchInvestingWalletSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
      ]);

      setCategories(categoriesPayload.categories);
      setTransactions(sortTransactionsByOption(transactionsPayload.transactions, sortOption));
      setInvestingWallet(walletPayload);
      setInvestingWalletSummary(walletSummaryPayload);
      setIsUsingMockData(false);
    } catch {
      const fallbackCategories = MOCK_CATEGORIES;
      setCategories(fallbackCategories);
      setTransactions(sortTransactionsByOption(buildMockTransactions(selectedMonth, fallbackCategories), sortOption));
      setInvestingWallet(null);
      setInvestingWalletSummary(null);
      setIsUsingMockData(true);
      setLoadError('Live API unavailable. Showing demo fallback data.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, selectedMonth, selectedMonthParts.month, selectedMonthParts.year, sortOption]);

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
    const monthlyBudgetGoal =
      typeof user?.monthlyBudgetGoal === 'number' && user.monthlyBudgetGoal > 0
        ? user.monthlyBudgetGoal
        : null;
    const income = transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalBalance = income - expenses;
    const remainingBudget = monthlyBudgetGoal !== null ? monthlyBudgetGoal - expenses : null;
    const percentSpent =
      monthlyBudgetGoal && monthlyBudgetGoal > 0
        ? Math.round((expenses / monthlyBudgetGoal) * 100)
        : null;
    const balanceRatio = income > 0 ? (totalBalance / income) * 100 : 0;
    const investingGoal = investingWallet?.monthlyGoal ?? 0;
    const investedThisMonth = investingWalletSummary?.investedThisMonthRON ?? 0;
    const investingProgress =
      investingGoal > 0 ? Math.round((investedThisMonth / investingGoal) * 100) : null;
    const investingAccountBalance = investingWallet?.balance ?? 0;

    return {
      income,
      expenses,
      totalBalance,
      monthlyBudgetGoal,
      remainingBudget,
      percentSpent,
      balanceRatio,
      investingGoal,
      investedThisMonth,
      investingProgress,
      investingAccountBalance,
    };
  }, [investingWallet, investingWalletSummary, transactions, user]);

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
    } catch (error) {
      if (isUsingMockData) {
        setCurrentUser({
          ...user,
          monthlyBudgetGoal: amount,
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
      const conversionPayload = await convertInvestingWalletToEur(amountRON, accessToken);
      const [walletPayload, walletSummaryPayload] = await Promise.all([
        fetchInvestingWallet(accessToken),
        fetchInvestingWalletSummary(accessToken, selectedMonthParts.year, selectedMonthParts.month),
        fetchInvestAccount(accessToken),
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

  const balanceBadge = makeProgressBadge(
    `${metrics.balanceRatio >= 0 ? '+' : ''}${Math.round(metrics.balanceRatio)}%`,
    'inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-500',
  );
  const budgetBadge = makeProgressBadge(
    `${Math.max(metrics.percentSpent ?? 0, 0)}% Spent`,
    'text-xs font-bold text-orange-500',
  );
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
      <div className="space-y-6 lg:space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-slate-900">Budget & Expenses</h1>
            <p className="mt-2 text-lg text-slate-500">
              Track your spending and manage your financial health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setIsBudgetModalOpen(true)}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Set Budget
            </button>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            accentDecorationClassName="bg-blue-100/70"
          />
          <KpiCard
            title="Monthly Income"
            value={formatCurrency(metrics.income, 2, budgetCurrency)}
            icon={<WalletIcon />}
            iconBgClassName="bg-emerald-50"
            iconClassName="text-emerald-500"
            badge={makeProgressBadge('Selected month', 'text-xs font-medium text-slate-500')}
            accentDecorationClassName="bg-emerald-100/70"
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
            accentDecorationClassName="bg-orange-100/70"
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
            <CategoryDonutChart slices={categorySpend} total={metrics.expenses} isLoading={isLoading} />

            <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Investing Account</h2>
                  <p className="mt-1 text-sm text-slate-500">RON wallet for funding your EUR investing portfolio.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsWalletSettingsModalOpen(true)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWalletDepositModalOpen(true)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-500">Monthly investing goal</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(metrics.investingGoal, 2, 'RON')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-500">Invested this month</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(metrics.investedThisMonth, 2, 'RON')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-500">Account balance</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(metrics.investingAccountBalance, 2, 'RON')}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                Auto-fund:{' '}
                {investingWallet?.autoFundEnabled
                  ? `${formatCurrency(investingWallet.autoFundAmount, 2, 'RON')} on day ${investingWallet.autoFundDayOfMonth}`
                  : 'Disabled'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Invested this month is based on deposits in the selected month.
              </p>

              {metrics.investingGoal > 0 ? (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <span>Progress</span>
                    <span>{Math.min(investingProgress ?? 0, 999)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-[#0EA5A4]"
                      style={{ width: `${Math.max(0, Math.min(investingProgress ?? 0, 100))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  Set a monthly investing goal to track progress.
                </p>
              )}
            </section>

          </div>
        </section>
      </div>

      <button
        type="button"
        className="fixed bottom-6 right-4 z-30 inline-flex items-center gap-3 rounded-full bg-slate-900 px-6 py-4 text-lg font-medium text-white shadow-[0_18px_45px_rgba(15,23,42,0.3)] transition hover:bg-slate-800 sm:right-6"
      >
        <span className="text-xl">✦</span>
        Ask Finny
      </button>

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
