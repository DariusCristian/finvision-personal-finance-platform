import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { BudgetTransaction } from '../lib/api';

type TransactionsTableProps = {
  transactions: BudgetTransaction[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortOption: 'date' | '-date' | 'amount' | '-amount';
  onSortChange: (value: 'date' | '-date' | 'amount' | '-amount') => void;
  isLoading: boolean;
  onEditTransaction: (transaction: BudgetTransaction) => void;
  onDeleteTransaction: (transaction: BudgetTransaction) => void;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <circle cx="6.5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="17.5" cy="12" r="1.5" />
    </svg>
  );
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const formatAmount = (transaction: BudgetTransaction) => {
  const amount = currencyFormatter.format(transaction.amount);
  return transaction.type === 'income' ? `+${amount}` : `-${amount}`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  if (isSameDay) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const toSoftBackground = (hex: string) => `${hex}20`;

const getRowLabel = (transaction: BudgetTransaction) => {
  const description = transaction.description.trim();

  if (description) {
    return description;
  }

  return transaction.type === 'income' ? 'Income transaction' : 'Expense transaction';
};

const getMetaLabel = (transaction: BudgetTransaction) => {
  if (transaction.category) {
    return transaction.category.name;
  }

  return transaction.type === 'income' ? 'Money in' : 'Money out';
};

const getAvatarLabel = (transaction: BudgetTransaction) => {
  const source = transaction.category?.name ?? transaction.description ?? transaction.type;

  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 1)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export function TransactionsTable({
  transactions,
  searchValue,
  onSearchChange,
  sortOption,
  onSortChange,
  isLoading,
  onEditTransaction,
  onDeleteTransaction,
}: TransactionsTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!tableRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSortChange(event.target.value as 'date' | '-date' | 'amount' | '-amount');
  };

  const handleEdit = (transaction: BudgetTransaction) => {
    setOpenMenuId(null);
    onEditTransaction(transaction);
  };

  const handleDelete = (transaction: BudgetTransaction) => {
    setOpenMenuId(null);
    onDeleteTransaction(transaction);
  };

  return (
    <section
      ref={tableRef}
      className="flex min-h-[30rem] flex-col overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] lg:col-span-8"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-slate-900">Transactions</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchValue}
              onChange={handleSearchChange}
              placeholder="Search..."
              className="w-full rounded-xl border-none bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:ring-2 focus:ring-[#2563eb] sm:w-64"
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
            <span className="font-medium text-slate-500">Sort</span>
            <select
              value={sortOption}
              onChange={handleSortChange}
              className="min-w-[11.5rem] bg-transparent text-sm font-medium text-slate-700 outline-none"
              aria-label="Sort transactions"
            >
              <option value="-date">Date: Newest - Oldest</option>
              <option value="date">Date: Oldest - Newest</option>
              <option value="-amount">Amount: High - Low</option>
              <option value="amount">Amount: Low - High</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <thead>
            <tr className="bg-slate-50/70 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-6 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                  Loading transactions...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                  No transactions match this month yet.
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => {
                const categoryColor = transaction.category?.color ?? '#94A3B8';
                const menuIsOpen = openMenuId === transaction.id;

                return (
                  <tr key={transaction.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                          style={{
                            backgroundColor:
                              transaction.type === 'income' ? 'rgba(16, 185, 129, 0.14)' : '#f1f5f9',
                            color: transaction.type === 'income' ? '#059669' : '#475569',
                          }}
                        >
                          {getAvatarLabel(transaction)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{getRowLabel(transaction)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-slate-500">{getMetaLabel(transaction)}</p>
                            {transaction.isRecurring ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Recurring
                              </span>
                            ) : null}
                            {transaction.isProjected ? (
                              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2563eb]">
                                Projected
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: toSoftBackground(categoryColor),
                          color: categoryColor,
                        }}
                      >
                        {transaction.category?.name ?? 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-slate-500">{formatDate(transaction.date)}</td>
                    <td
                      className={[
                        'px-6 py-5 text-right font-semibold',
                        transaction.type === 'income' ? 'text-emerald-500' : 'text-slate-900',
                      ].join(' ')}
                    >
                      {formatAmount(transaction)}
                    </td>
                    <td className="relative px-6 py-5 text-center text-slate-400">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId((current) => (current === transaction.id ? null : transaction.id))}
                        className="transition hover:text-[#2563eb]"
                        aria-label="Actions"
                      >
                        <MoreIcon />
                      </button>
                      {menuIsOpen ? (
                        <div className="absolute right-6 top-[calc(100%-0.15rem)] z-10 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
                          <button
                            type="button"
                            onClick={() => handleEdit(transaction)}
                            className="block w-full px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            Edit Transaction
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(transaction)}
                            className="block w-full border-t border-slate-100 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                          >
                            Delete Transaction
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-auto border-t border-slate-100 px-6 py-5 text-center">
        <button type="button" className="text-lg font-medium text-[#2563eb] transition hover:text-[#1d4ed8]">
          View All Transactions
        </button>
      </div>
    </section>
  );
}
