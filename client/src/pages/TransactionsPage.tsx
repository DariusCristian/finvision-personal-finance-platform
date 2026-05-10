import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AddTransactionModal } from '../components/AddTransactionModal';
import { AppShell } from '../components/AppShell';
import { TransactionsTable } from '../components/TransactionsTable';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
  type BudgetCategory,
  type BudgetTransaction,
  type TransactionListMeta,
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
  const offsets = Array.from(
    { length: previousCount + futureCount + 1 },
    (_, index) => index - previousCount,
  );

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

  return {
    from: startDate.toISOString().slice(0, 10),
    to: endDate.toISOString().slice(0, 10),
  };
};

const DEFAULT_META: TransactionListMeta = {
  count: 0,
  projectedCount: 0,
  sort: '-date',
  page: 1,
  limit: 100,
  total: 0,
  totalPages: 1,
};

export function TransactionsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthOptions = useMemo(() => buildMonthOptions(12, 12), []);
  const currentMonth = getMonthKey(new Date());
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [meta, setMeta] = useState<TransactionListMeta>(DEFAULT_META);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchValue, setSearchValue] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('-date');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editTransactionId = searchParams.get('edit');

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const loadCategories = async () => {
      try {
        const payload = await fetchCategories(accessToken);
        setCategories(payload.categories);
      } catch (error) {
        setLoadError(
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to load transaction categories right now.',
        );
      }
    };

    void loadCategories();
  }, [accessToken]);

  const loadTransactions = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const range = getMonthRange(selectedMonth);
      const payload = await fetchTransactions(
        {
          ...range,
          type: typeFilter === 'all' ? undefined : typeFilter,
          categoryId: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
          search: searchValue.trim() || undefined,
          sort: sortOption,
          page,
          limit: 100,
        },
        accessToken,
      );

      setTransactions(payload.transactions);
      setMeta(payload.meta ?? DEFAULT_META);
    } catch (error) {
      setLoadError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to load transactions right now.',
      );
      setTransactions([]);
      setMeta(DEFAULT_META);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, page, searchValue, selectedCategoryId, selectedMonth, sortOption, typeFilter]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    if (!editTransactionId || isModalOpen || transactions.length === 0) {
      return;
    }

    const matchingTransaction = transactions.find(
      (transaction) =>
        transaction.originalTransactionId === editTransactionId || transaction.id === editTransactionId,
    );

    if (!matchingTransaction) {
      return;
    }

    setEditingTransaction(matchingTransaction);
    setIsModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('edit');
    setSearchParams(nextParams, { replace: true });
  }, [editTransactionId, isModalOpen, searchParams, setSearchParams, transactions]);

  const availableCategoryOptions = useMemo(() => {
    if (typeFilter === 'all') {
      return categories;
    }

    return categories.filter((category) => category.kind === typeFilter);
  }, [categories, typeFilter]);

  useEffect(() => {
    if (
      selectedCategoryId !== 'all' &&
      !availableCategoryOptions.some((category) => category.id === selectedCategoryId)
    ) {
      setSelectedCategoryId('all');
      setPage(1);
    }
  }, [availableCategoryOptions, selectedCategoryId]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((value: SortOption) => {
    setSortOption(value);
    setPage(1);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((transaction: BudgetTransaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  }, []);

  const handleSaveTransaction = async (payload: CreateTransactionArgs) => {
    if (!accessToken) {
      throw new Error('You need to be logged in to save a transaction.');
    }

    setIsSubmitting(true);

    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.originalTransactionId, payload, accessToken);
      } else {
        await createTransaction(payload, accessToken);
        setPage(1);
      }

      setEditingTransaction(null);
      setIsModalOpen(false);
      await loadTransactions();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }

      throw new Error('Unable to save the transaction right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransaction = useCallback(async (transaction: BudgetTransaction) => {
    const targetLabel = transaction.isProjected
      ? 'this recurring source transaction'
      : 'this transaction';
    const confirmed = window.confirm(`Delete ${targetLabel}? This action cannot be undone.`);

    if (!confirmed || !accessToken) {
      return;
    }

    setIsSubmitting(true);

    try {
      await deleteTransaction(transaction.originalTransactionId, accessToken);

      if (editingTransaction?.originalTransactionId === transaction.originalTransactionId) {
        setEditingTransaction(null);
        setIsModalOpen(false);
      }

      await loadTransactions();
    } catch (error) {
      setLoadError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to delete the transaction right now.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [accessToken, editingTransaction, loadTransactions]);

  const handleDeleteTransactionClick = useCallback((transaction: BudgetTransaction) => {
    void handleDeleteTransaction(transaction);
  }, [handleDeleteTransaction]);

  return (
    <AppShell activeTab="budget">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb] dark:text-blue-400">
              Transactions
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">
              All Transactions
            </h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
              Review every income and expense entry with filtering, sorting, and quick edits.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <span className="text-base leading-none">+</span>
            Add Transaction
          </button>
        </header>

        <section className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
              Month
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPage(1);
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-blue-900/40"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
              Type
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as 'all' | 'income' | 'expense');
                  setPage(1);
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-blue-900/40"
              >
                <option value="all">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 md:col-span-2 xl:col-span-1">
              Category
              <select
                value={selectedCategoryId}
                onChange={(event) => {
                  setSelectedCategoryId(event.target.value);
                  setPage(1);
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-blue-900/40"
              >
                <option value="all">All categories</option>
                {availableCategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <div className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
                Showing {meta.count} of {meta.total} results
              </div>
            </div>
          </div>
        </section>

        {loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400">
            {loadError}
          </div>
        ) : null}

        <TransactionsTable
          title="All Transactions"
          transactions={transactions}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          sortOption={sortOption}
          onSortChange={handleSortChange}
          isLoading={isLoading}
          emptyMessage="No transactions match the selected filters."
          heightClassName="h-[34rem] lg:h-[40rem]"
          viewAllHref={null}
          onEditTransaction={handleOpenEditModal}
          onDeleteTransaction={handleDeleteTransactionClick}
          virtualizedRows
        />

        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-100 bg-white px-5 py-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Page {meta.page ?? 1} of {meta.totalPages ?? 1}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={(meta.page ?? 1) <= 1 || isLoading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:disabled:text-slate-600"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(meta.totalPages ?? current, current + 1),
                )
              }
              disabled={
                isLoading ||
                (meta.totalPages !== null && (meta.page ?? 1) >= meta.totalPages)
              }
              className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <AddTransactionModal
        isOpen={isModalOpen}
        mode={editingTransaction ? 'edit' : 'create'}
        initialTransaction={editingTransaction}
        categories={categories}
        isSubmitting={isSubmitting}
        onClose={() => {
          setEditingTransaction(null);
          setIsModalOpen(false);
        }}
        onSubmit={handleSaveTransaction}
      />
    </AppShell>
  );
}
