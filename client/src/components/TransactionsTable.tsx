import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';

import type { BudgetTransaction } from '../lib/api';

type SortOption = 'date' | '-date' | 'amount' | '-amount';

type TransactionsTableProps = {
  title?: string;
  transactions: BudgetTransaction[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortOption: SortOption;
  onSortChange: (value: SortOption) => void;
  isLoading: boolean;
  emptyMessage?: string;
  heightClassName?: string;
  viewAllHref?: string | null;
  viewAllLabel?: string;
  onEditTransaction: (transaction: BudgetTransaction) => void;
  onDeleteTransaction: (transaction: BudgetTransaction) => void;
  virtualizedRows?: boolean;
  currency?: 'RON' | 'EUR' | 'USD';
};

type RowActionHandlers = {
  openMenuId: string | null;
  onToggleMenu: (transactionId: string) => void;
  onEditTransaction: (transaction: BudgetTransaction) => void;
  onDeleteTransaction: (transaction: BudgetTransaction) => void;
};

type VirtualizedRowData = RowActionHandlers & {
  transactions: BudgetTransaction[];
  currency: 'RON' | 'EUR' | 'USD';
};

const HEADER_CELL_CLASS = 'sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-6 py-4';
const GRID_TEMPLATE = 'minmax(0,2.4fr) minmax(0,1.25fr) minmax(0,1.1fr) minmax(0,1fr) 4.5rem';
const VIRTUAL_ROW_HEIGHT = 104;

const formatAmount = (transaction: BudgetTransaction, currency: 'RON' | 'EUR' | 'USD') => {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(transaction.amount);
  return transaction.type === 'income' ? `+${amount}` : `-${amount}`;
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

function TransactionDetailContent({ transaction }: { transaction: BudgetTransaction }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        style={{
          backgroundColor:
            transaction.type === 'income' ? 'rgba(16, 185, 129, 0.14)' : '#f1f5f9',
          color: transaction.type === 'income' ? '#059669' : '#475569',
        }}
      >
        {getAvatarLabel(transaction)}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{getRowLabel(transaction)}</p>
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
  );
}

function TransactionCategoryChip({ transaction }: { transaction: BudgetTransaction }) {
  const categoryColor = transaction.category?.color ?? '#94A3B8';

  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: toSoftBackground(categoryColor),
        color: categoryColor,
      }}
    >
      {transaction.category?.name ?? 'Uncategorized'}
    </span>
  );
}

function TransactionAmountText({
  transaction,
  currency,
}: {
  transaction: BudgetTransaction;
  currency: 'RON' | 'EUR' | 'USD';
}) {
  return (
    <span
      className={[
        'font-semibold',
        transaction.type === 'income' ? 'text-emerald-500' : 'text-slate-900',
      ].join(' ')}
    >
      {formatAmount(transaction, currency)}
    </span>
  );
}

function TransactionActionsMenu({
  transaction,
  menuIsOpen,
  onToggleMenu,
  onEditTransaction,
  onDeleteTransaction,
}: {
  transaction: BudgetTransaction;
  menuIsOpen: boolean;
} & RowActionHandlers) {
  return (
    <div className="relative text-center text-slate-400">
      <button
        type="button"
        onClick={() => onToggleMenu(transaction.id)}
        className="transition hover:text-[#2563eb]"
        aria-label="Actions"
      >
        <MoreIcon />
      </button>
      {menuIsOpen ? (
        <div className="absolute right-0 top-[calc(100%-0.15rem)] z-20 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
          <button
            type="button"
            onClick={() => onEditTransaction(transaction)}
            className="block w-full px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Edit Transaction
          </button>
          <button
            type="button"
            onClick={() => onDeleteTransaction(transaction)}
            className="block w-full border-t border-slate-100 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            Delete Transaction
          </button>
        </div>
      ) : null}
    </div>
  );
}

const TransactionTableRow = memo(function TransactionTableRow({
  transaction,
  openMenuId,
  onToggleMenu,
  onEditTransaction,
  onDeleteTransaction,
  currency,
}: {
  transaction: BudgetTransaction;
  currency: 'RON' | 'EUR' | 'USD';
} & RowActionHandlers) {
  const menuIsOpen = openMenuId === transaction.id;

  return (
    <tr className="transition-colors hover:bg-slate-50/80">
      <td className="px-6 py-5">
        <TransactionDetailContent transaction={transaction} />
      </td>
      <td className="px-6 py-5">
        <TransactionCategoryChip transaction={transaction} />
      </td>
      <td className="px-6 py-5 text-slate-500">{formatDate(transaction.date)}</td>
      <td className="px-6 py-5 text-right">
        <TransactionAmountText transaction={transaction} currency={currency} />
      </td>
      <td className="px-6 py-5">
        <TransactionActionsMenu
          transaction={transaction}
          menuIsOpen={menuIsOpen}
          openMenuId={openMenuId}
          onToggleMenu={onToggleMenu}
          onEditTransaction={onEditTransaction}
          onDeleteTransaction={onDeleteTransaction}
        />
      </td>
    </tr>
  );
});

function VirtualizedTransactionRow({
  index,
  style,
  ariaAttributes,
  transactions,
  openMenuId,
  onToggleMenu,
  onEditTransaction,
  onDeleteTransaction,
  currency,
}: RowComponentProps<VirtualizedRowData>) {
  const transaction = transactions[index];
  const menuIsOpen = openMenuId === transaction.id;
  const rowStyle: CSSProperties = {
    ...style,
    width: '100%',
  };

  return (
    <div
      {...ariaAttributes}
      style={rowStyle}
      className="border-b border-slate-100 px-6 py-4 last:border-b-0 hover:bg-slate-50/80"
    >
      <div
        className="grid min-h-[4rem] items-center gap-4"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <TransactionDetailContent transaction={transaction} />
        <TransactionCategoryChip transaction={transaction} />
        <span className="text-sm text-slate-500">{formatDate(transaction.date)}</span>
        <div className="text-right">
          <TransactionAmountText transaction={transaction} currency={currency} />
        </div>
        <div className="justify-self-center">
          <TransactionActionsMenu
            transaction={transaction}
            menuIsOpen={menuIsOpen}
            openMenuId={openMenuId}
            onToggleMenu={onToggleMenu}
            onEditTransaction={onEditTransaction}
            onDeleteTransaction={onDeleteTransaction}
          />
        </div>
      </div>
    </div>
  );
}

export function TransactionsTable({
  title = 'Recent Transactions',
  transactions,
  searchValue,
  onSearchChange,
  sortOption,
  onSortChange,
  isLoading,
  emptyMessage = 'No transactions match this view yet.',
  heightClassName = 'h-[30rem] sm:h-[31rem] md:h-[32rem]',
  viewAllHref = null,
  viewAllLabel = 'View all transactions',
  onEditTransaction,
  onDeleteTransaction,
  virtualizedRows = false,
  currency = 'RON',
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

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value);
    },
    [onSearchChange],
  );

  const handleSortChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onSortChange(event.target.value as SortOption);
    },
    [onSortChange],
  );

  const handleToggleMenu = useCallback((transactionId: string) => {
    setOpenMenuId((current) => (current === transactionId ? null : transactionId));
  }, []);

  const handleEdit = useCallback(
    (transaction: BudgetTransaction) => {
      setOpenMenuId(null);
      onEditTransaction(transaction);
    },
    [onEditTransaction],
  );

  const handleDelete = useCallback(
    (transaction: BudgetTransaction) => {
      setOpenMenuId(null);
      onDeleteTransaction(transaction);
    },
    [onDeleteTransaction],
  );

  const virtualizedRowProps = useMemo<VirtualizedRowData>(
    () => ({
      transactions,
      openMenuId,
      onToggleMenu: handleToggleMenu,
      onEditTransaction: handleEdit,
      onDeleteTransaction: handleDelete,
      currency,
    }),
    [transactions, openMenuId, handleToggleMenu, handleEdit, handleDelete, currency],
  );

  return (
    <section
      ref={tableRef}
      className={[
        'flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] lg:col-span-8',
        heightClassName,
      ].join(' ')}
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
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

      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center px-6 py-16 text-center text-slate-500">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 py-16 text-center text-slate-500">
            {emptyMessage}
          </div>
        ) : virtualizedRows ? (
          <div className="flex h-full min-w-[42rem] flex-col">
            <div
              className="grid shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
              style={{ gridTemplateColumns: GRID_TEMPLATE }}
            >
              <div className={HEADER_CELL_CLASS}>Details</div>
              <div className={HEADER_CELL_CLASS}>Category</div>
              <div className={HEADER_CELL_CLASS}>Date</div>
              <div className={[HEADER_CELL_CLASS, 'text-right'].join(' ')}>Amount</div>
              <div className={[HEADER_CELL_CLASS, 'text-center'].join(' ')}>Action</div>
            </div>
            <div className="min-h-0 flex-1">
              <List
                rowComponent={VirtualizedTransactionRow}
                rowCount={transactions.length}
                rowHeight={VIRTUAL_ROW_HEIGHT}
                rowProps={virtualizedRowProps}
                overscanCount={6}
                className="h-full"
                style={{ height: '100%' }}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className={HEADER_CELL_CLASS}>Details</th>
                  <th className={HEADER_CELL_CLASS}>Category</th>
                  <th className={HEADER_CELL_CLASS}>Date</th>
                  <th className={[HEADER_CELL_CLASS, 'text-right'].join(' ')}>Amount</th>
                  <th className={[HEADER_CELL_CLASS, 'text-center'].join(' ')}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {transactions.map((transaction) => (
                  <TransactionTableRow
                    key={transaction.id}
                    transaction={transaction}
                    openMenuId={openMenuId}
                    onToggleMenu={handleToggleMenu}
                    onEditTransaction={handleEdit}
                    onDeleteTransaction={handleDelete}
                    currency={currency}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewAllHref ? (
        <div className="mt-auto shrink-0 border-t border-slate-100 px-6 py-5 text-center">
          <Link
            to={viewAllHref}
            className="text-lg font-medium text-[#2563eb] transition hover:text-[#1d4ed8]"
          >
            {viewAllLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
