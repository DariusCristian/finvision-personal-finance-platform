import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { currencyIndicator } from '../lib/formatters';
import type { BudgetCategory, BudgetTransaction } from '../lib/api';

type RecurrenceValue = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';

type AddTransactionModalProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialTransaction?: BudgetTransaction | null;
  categories: BudgetCategory[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    type: 'income' | 'expense';
    amount: number;
    categoryId: string;
    date: string;
    description: string;
    isRecurring: boolean;
    recurrence: RecurrenceValue;
    recurrenceEndDate: string | null;
  }) => Promise<void>;
};

const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
] as const;

const fieldClassName =
  'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40';

const addMonthsToDateString = (dateString: string, monthCount: number) => {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + monthCount);
  return date.toISOString().slice(0, 10);
};

const getCategoryLabel = (category: BudgetCategory) => {
  if (category.slug === 'food-dining') {
    return 'Food';
  }

  return category.name;
};

const getCategoryInitials = (category: BudgetCategory) =>
  category.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const normalizeDateValue = (value: string | null | undefined) => value?.slice(0, 10) ?? '';

type CategoryOptionButtonProps = {
  category: BudgetCategory;
  isActive: boolean;
  onSelect: (categoryId: string) => void;
};

const CategoryOptionButton = memo(function CategoryOptionButton({
  category,
  isActive,
  onSelect,
}: CategoryOptionButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      className={[
        'flex min-w-0 flex-col items-center rounded-2xl border px-3 py-4 text-center transition',
        isActive
          ? 'border-[#2563eb] bg-blue-50 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)] dark:bg-blue-900/30'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold"
        style={{
          backgroundColor: `${category.color}20`,
          color: category.color,
        }}
      >
        {getCategoryInitials(category)}
      </span>
      <span
        className={[
          'mt-3 line-clamp-2 text-sm font-medium',
          isActive ? 'text-[#2563eb]' : 'text-slate-600 dark:text-slate-300',
        ].join(' ')}
      >
        {getCategoryLabel(category)}
      </span>
    </button>
  );
});

export function AddTransactionModal({
  isOpen,
  mode,
  initialTransaction = null,
  categories,
  isSubmitting,
  onClose,
  onSubmit,
}: AddTransactionModalProps) {
  const { user } = useAuth();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [repeat, setRepeat] = useState<RecurrenceValue>('none');
  const [endDate, setEndDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.kind === type || category.kind === 'both'),
    [categories, type],
  );
  const handleCategorySelect = useCallback((nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
  }, []);
  const categoryOptions = useMemo(
    () =>
      availableCategories.map((category) => (
        <CategoryOptionButton
          key={category.id}
          category={category}
          isActive={category.id === categoryId}
          onSelect={handleCategorySelect}
        />
      )),
    [availableCategories, categoryId, handleCategorySelect],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === 'edit' && initialTransaction) {
      const sourceDate = normalizeDateValue(initialTransaction.sourceDate || initialTransaction.date);
      const nextRepeat = initialTransaction.isRecurring ? initialTransaction.recurrence : 'none';

      setType(initialTransaction.type);
      setAmount(String(initialTransaction.amount));
      setCategoryId(initialTransaction.category?.id ?? '');
      setDate(sourceDate || new Date().toISOString().slice(0, 10));
      setDescription(initialTransaction.description);
      setRepeat(nextRepeat);
      setEndDate(
        nextRepeat !== 'none'
          ? normalizeDateValue(initialTransaction.recurrenceEndDate) || addMonthsToDateString(sourceDate, 3)
          : '',
      );
      setFormError(null);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    setType('expense');
    setAmount('');
    setDescription('');
    setDate(today);
    setRepeat('none');
    setEndDate('');
    setFormError(null);
  }, [initialTransaction, isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (availableCategories.length === 0) {
      setCategoryId('');
      return;
    }

    setCategoryId((current) => {
      if (current && availableCategories.some((category) => category.id === current)) {
        return current;
      }

      if (mode === 'edit' && initialTransaction?.category?.id) {
        const existing = availableCategories.find((category) => category.id === initialTransaction.category?.id);
        if (existing) {
          return existing.id;
        }
      }

      const preferred = availableCategories.find((category) => category.slug === 'shopping');
      return preferred?.id ?? availableCategories[0].id;
    });
  }, [availableCategories, initialTransaction, isOpen, mode]);

  useEffect(() => {
    if (repeat === 'none') {
      setEndDate('');
      return;
    }

    setEndDate((current) => {
      if (!current || current < date) {
        return addMonthsToDateString(date, 3);
      }

      return current;
    });
  }, [date, repeat]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const isEditing = mode === 'edit';
  const amountCurrencyIndicator = currencyIndicator(user?.baseCurrency);
  const isTextCurrencyIndicator = amountCurrencyIndicator.length > 1;

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async () => {
    const parsedAmount = Number(amount);

    if (!categoryId || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !date) {
      setFormError('Complete all required fields before saving the transaction.');
      return;
    }

    if (repeat !== 'none' && !endDate) {
      setFormError('Recurring transactions require an end date.');
      return;
    }

    if (repeat !== 'none' && endDate < date) {
      setFormError('Recurring end date must be on or after the start date.');
      return;
    }

    setFormError(null);

    try {
      await onSubmit({
        type,
        amount: parsedAmount,
        categoryId,
        date,
        description: description.trim(),
        isRecurring: repeat !== 'none',
        recurrence: repeat,
        recurrenceEndDate: repeat !== 'none' ? endDate : null,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save this transaction.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-3 py-4 sm:px-4 sm:py-6 dark:bg-black/60"
      onClick={onClose}
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-[44rem] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100 sm:text-[2rem]">
                {isEditing ? 'Edit Transaction' : 'Add Transaction'}
              </h2>
              {initialTransaction?.isProjected ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  This edits the recurring source transaction for the projected entry.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="m6 6 12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="space-y-5 sm:space-y-6">
            <div className="rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              <div className="grid grid-cols-2 gap-1">
                {(['expense', 'income'] as const).map((option) => {
                  const isActive = option === type;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setType(option)}
                      className={[
                        'rounded-[1rem] px-4 py-3 text-lg font-medium transition',
                        isActive
                          ? 'bg-white text-slate-900 shadow-[0_1px_4px_rgba(15,23,42,0.08)] dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                      ].join(' ')}
                    >
                      {option === 'expense' ? 'Expense' : 'Income'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Amount</p>
              <div className="mt-4 flex items-end justify-center gap-2 sm:gap-3">
                <span
                  className={[
                    'font-semibold tracking-[-0.04em] text-slate-400',
                    isTextCurrencyIndicator ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl',
                  ].join(' ')}
                >
                  {amountCurrencyIndicator}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="w-full max-w-[16rem] border-none bg-transparent p-0 text-center text-4xl font-semibold tracking-[-0.05em] text-slate-900 outline-none placeholder:text-slate-300 dark:text-slate-100 dark:placeholder:text-slate-600 sm:text-6xl"
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Category</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {categoryOptions}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className={fieldClassName}
                />
              </label>
              <label className="block text-sm font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                Repeat
                <select
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value as RecurrenceValue)}
                  className={fieldClassName}
                >
                  {REPEAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {repeat !== 'none' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 sm:col-span-1">
                  End Date
                  <input
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={fieldClassName}
                  />
                </label>
                <div className="flex items-end">
                  <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Recurring transactions are saved and projected into future months automatically.
                  </p>
                </div>
              </div>
            ) : null}

            <label className="block text-sm font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              Note (Optional)
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this for?"
                className={fieldClassName}
              />
            </label>

            {formError ? <p className="text-sm font-medium text-rose-500">{formError}</p> : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:px-7 sm:py-3.5 sm:text-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#2563eb] px-6 py-3 text-base font-medium text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)] transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300 sm:px-8 sm:py-3.5 sm:text-lg"
          >
            <span className="text-xl leading-none">+</span>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Transaction'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
