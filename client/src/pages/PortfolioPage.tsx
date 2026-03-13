import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { TradeOrderModal } from '../components/TradeOrderModal';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  fetchInvestTopUpQuote,
  fetchInvestHoldings,
  fetchInvestSnapshots,
  fetchInvestTrades,
  placeInvestOrder,
  placeInvestStockOrder,
  resetDemoPortfolio,
  topUpInvestingCash,
  type PortfolioHolding,
  type PortfolioSnapshot,
  type PortfolioTotals,
  type PortfolioTrade,
} from '../lib/api';
import { formatMoney, formatPct, formatPrice, formatQty } from '../lib/formatters';

const EMPTY_TOTALS: PortfolioTotals = {
  cashBalance: 0,
  holdingsValue: 0,
  totalValue: 0,
  unrealizedPnL: 0,
  holdingsCount: 0,
};

const ALLOCATION_COLORS = ['#2563eb', '#22c55e', '#94a3b8'];

type AllocationSlice = {
  label: string;
  value: number;
  pct: number;
  color: string;
};

const getPriceColorClassName = (value: number | null) => {
  if (typeof value !== 'number') {
    return 'text-slate-500';
  }

  return value >= 0 ? 'text-emerald-600' : 'text-rose-600';
};

const normalizeSnapshots = (snapshots: PortfolioSnapshot[], fallbackValue: number) => {
  if (snapshots.length > 1) {
    return snapshots;
  }

  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return {
      id: `fallback-${index}`,
      date: date.toISOString().slice(0, 10),
      totalValue: fallbackValue,
      cashBalance: fallbackValue,
      holdingsValue: 0,
      createdAt: date.toISOString(),
    };
  });
};

const buildAllocationSlices = (holdings: PortfolioHolding[], totals: PortfolioTotals): AllocationSlice[] => {
  const cryptoValue = holdings
    .filter((holding) => holding.assetType === 'crypto')
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const stockValue = holdings
    .filter((holding) => holding.assetType === 'stock')
    .reduce((sum, holding) => sum + holding.marketValue, 0);

  const rawSlices = [
    { label: 'Crypto', value: cryptoValue, color: ALLOCATION_COLORS[0] },
    { label: 'Stocks', value: stockValue, color: ALLOCATION_COLORS[1] },
    { label: 'Cash', value: Math.max(0, totals.cashBalance), color: ALLOCATION_COLORS[2] },
  ].filter((slice) => slice.value > 0);

  const totalValue = rawSlices.reduce((sum, slice) => sum + slice.value, 0);

  if (totalValue <= 0) {
    return [];
  }

  return rawSlices.map((slice) => ({
    ...slice,
    pct: (slice.value / totalValue) * 100,
  }));
};

const buildDonutBackground = (slices: AllocationSlice[]) => {
  if (slices.length === 0) {
    return '#e2e8f0';
  }

  let cursor = 0;
  const gradientStops = slices.map((slice) => {
    const start = cursor;
    cursor += slice.pct;

    return `${slice.color} ${start.toFixed(3)}% ${Math.min(cursor, 100).toFixed(3)}%`;
  });

  return `conic-gradient(${gradientStops.join(', ')})`;
};

function PerformanceChart({ points, isLoading }: { points: PortfolioSnapshot[]; isLoading: boolean }) {
  const width = 680;
  const height = 240;
  const padding = 24;

  const pathData = useMemo(() => {
    if (points.length === 0) {
      return '';
    }

    const values = points.map((point) => point.totalValue);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return points
      .map((point, index) => {
        const x =
          points.length === 1
            ? width / 2
            : padding + (index / (points.length - 1)) * (width - padding * 2);
        const y = height - padding - ((point.totalValue - min) / range) * (height - padding * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  if (isLoading) {
    return <div className="h-60 animate-pulse rounded-2xl bg-slate-100" />;
  }

  return (
    <div className="h-60 rounded-2xl border border-slate-200 bg-slate-50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <polyline points={pathData} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function PortfolioPage() {
  const { accessToken } = useAuth();
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [totals, setTotals] = useState<PortfolioTotals>(EMPTY_TOTALS);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [trades, setTrades] = useState<PortfolioTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<PortfolioHolding | null>(null);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('sell');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isResettingPortfolio, setIsResettingPortfolio] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmountInput, setTopUpAmountInput] = useState('500');
  const [isTopUpQuoteLoading, setIsTopUpQuoteLoading] = useState(false);
  const [isTopUpSubmitting, setIsTopUpSubmitting] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [topUpQuote, setTopUpQuote] = useState<{ rate: number; estimatedEUR: number } | null>(null);
  const [assetFilter, setAssetFilter] = useState<'all' | 'crypto' | 'stock'>('all');

  const displayCurrency = 'EUR';

  const loadPortfolioData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [holdingsPayload, snapshotsPayload, tradesPayload] = await Promise.all([
        fetchInvestHoldings(accessToken),
        fetchInvestSnapshots(accessToken, 7),
        fetchInvestTrades(accessToken, 10),
      ]);

      setHoldings(holdingsPayload.holdings);
      setTotals(holdingsPayload.totals);
      setSnapshots(snapshotsPayload.snapshots);
      setTrades(tradesPayload.trades);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to load demo portfolio data right now.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPortfolioData();
  }, [loadPortfolioData]);

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

  const parsedTopUpAmount = useMemo(() => {
    const numericAmount = Number(topUpAmountInput);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return 0;
    }

    return numericAmount;
  }, [topUpAmountInput]);

  useEffect(() => {
    if (!isTopUpOpen || !accessToken) {
      return;
    }

    if (parsedTopUpAmount <= 0) {
      setTopUpQuote(null);
      setTopUpError(null);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      setIsTopUpQuoteLoading(true);
      setTopUpError(null);

      void fetchInvestTopUpQuote(parsedTopUpAmount, accessToken, 'RON')
        .then((quote) => {
          if (!isActive) {
            return;
          }

          setTopUpQuote({
            rate: quote.rate,
            estimatedEUR: quote.estimatedEUR,
          });
        })
        .catch((caughtError) => {
          if (!isActive) {
            return;
          }

          setTopUpQuote(null);
          setTopUpError(
            caughtError instanceof ApiRequestError
              ? caughtError.message
              : 'Unable to fetch top-up quote right now.',
          );
        })
        .finally(() => {
          if (isActive) {
            setIsTopUpQuoteLoading(false);
          }
        });
    }, 350);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, isTopUpOpen, parsedTopUpAmount]);

  const hasEnoughHistory = snapshots.length > 1;

  const chartPoints = useMemo(
    () => normalizeSnapshots(snapshots, totals.totalValue || 10000),
    [snapshots, totals.totalValue],
  );

  const allocationSlices = useMemo(() => buildAllocationSlices(holdings, totals), [holdings, totals]);
  const filteredHoldings = useMemo(() => {
    if (assetFilter === 'all') {
      return holdings;
    }

    return holdings.filter((holding) => holding.assetType === assetFilter);
  }, [assetFilter, holdings]);

  const largestSlice = useMemo(() => {
    if (allocationSlices.length === 0) {
      return null;
    }

    return allocationSlices.reduce((largest, current) => (current.pct > largest.pct ? current : largest));
  }, [allocationSlices]);

  const handleTradeSubmit = async ({
    side,
    quantity,
  }: {
    side: 'buy' | 'sell';
    quantity: number;
  }) => {
    if (!accessToken || !selectedHolding) {
      return;
    }

    setIsSubmittingOrder(true);

    try {
      if (selectedHolding.assetType === 'stock') {
        await placeInvestStockOrder(
          {
            symbol: selectedHolding.symbol,
            side,
            quantity,
          },
          accessToken,
        );
      } else {
        await placeInvestOrder(
          {
            coinId: selectedHolding.coinId ?? selectedHolding.symbol.toLowerCase(),
            symbol: selectedHolding.symbol,
            side,
            quantity,
          },
          accessToken,
        );
      }

      await loadPortfolioData();
      setSelectedHolding(null);
      setTradeSide('sell');
      setSuccessMessage('Order executed.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleResetPortfolio = async () => {
    if (!accessToken || isResettingPortfolio) {
      return;
    }

    const shouldProceed = window.confirm(
      'This will reset your demo portfolio to €10,000 and remove holdings & trade history.',
    );

    if (!shouldProceed) {
      return;
    }

    setIsResettingPortfolio(true);

    try {
      await resetDemoPortfolio(accessToken);
      await loadPortfolioData();
      setSelectedHolding(null);
      setTradeSide('sell');
      setSuccessMessage('Demo portfolio reset.');
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to reset your demo portfolio right now.',
      );
    } finally {
      setIsResettingPortfolio(false);
    }
  };

  const handleTopUpSubmit = async () => {
    if (!accessToken || isTopUpSubmitting || parsedTopUpAmount <= 0) {
      return;
    }

    setIsTopUpSubmitting(true);
    setTopUpError(null);

    try {
      const result = await topUpInvestingCash(
        {
          fromCurrency: 'RON',
          amount: parsedTopUpAmount,
        },
        accessToken,
      );
      await loadPortfolioData();
      setIsTopUpOpen(false);
      setTopUpAmountInput('500');
      setTopUpQuote(null);
      setSuccessMessage(`Added ${formatMoney(result.addedEUR, 'EUR')} to investing cash.`);
    } catch (caughtError) {
      setTopUpError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to top up investing cash right now.',
      );
    } finally {
      setIsTopUpSubmitting(false);
    }
  };

  return (
    <AppShell activeTab="invest">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb]">Demo Invest</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900">Portfolio</h1>
            <p className="mt-3 max-w-2xl text-lg text-slate-500">
              Track your demo investments in EUR, monitor allocation, and practice orders risk-free.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Fund your investing balance from Budget → Investing Account.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/invest/discovery"
              className="inline-flex items-center rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Crypto Discovery
            </Link>
            <button
              type="button"
              onClick={() => {
                setTopUpError(null);
                setTopUpQuote(null);
                setIsTopUpOpen(true);
              }}
              className="inline-flex items-center rounded-xl border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Top up investing
            </button>
            <button
              type="button"
              disabled={isResettingPortfolio}
              onClick={handleResetPortfolio}
              className="inline-flex items-center rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResettingPortfolio ? 'Resetting...' : 'Reset demo'}
            </button>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-500"
            >
              Export Report (Soon)
            </button>
          </div>
        </header>

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <p className="text-sm text-slate-500">Portfolio Value (EUR)</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900">
              {formatMoney(totals.totalValue, displayCurrency)}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <p className="text-sm text-slate-500">Day&apos;s P/L</p>
            <p
              className={[
                'mt-2 text-3xl font-bold tracking-[-0.03em]',
                totals.unrealizedPnL >= 0 ? 'text-emerald-600' : 'text-rose-600',
              ].join(' ')}
            >
              {formatMoney(totals.unrealizedPnL, displayCurrency)}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <p className="text-sm text-slate-500">Buying Power (EUR)</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900">
              {formatMoney(totals.cashBalance, displayCurrency)}
            </p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Performance (7D)</h2>
              <span className="text-sm text-slate-500">
                {hasEnoughHistory ? 'Snapshot history' : 'Not enough history yet'}
              </span>
            </div>
            <PerformanceChart points={chartPoints} isLoading={isLoading} />
            {!hasEnoughHistory ? (
              <p className="mt-3 text-xs text-slate-500">
                Place a few trades over time to generate a fuller performance line.
              </p>
            ) : null}
          </article>

          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <h2 className="text-xl font-semibold text-slate-900">Allocation</h2>
            <div className="mt-6 flex items-center justify-center">
              <div
                className="relative h-44 w-44 rounded-full"
                style={{
                  background: buildDonutBackground(allocationSlices),
                }}
              >
                <div className="absolute inset-6 flex items-center justify-center rounded-full bg-white text-center">
                  {largestSlice ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Top</p>
                      <p className="text-base font-semibold text-slate-900">{largestSlice.label}</p>
                      <p className="text-sm text-slate-600">{formatPct(largestSlice.pct, 1)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-500">No allocation yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              {allocationSlices.length === 0 ? (
                <p className="text-slate-500">Place demo trades to see allocation.</p>
              ) : (
                allocationSlices.map((slice) => (
                  <div key={slice.label} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                      <span className="truncate text-slate-600">{slice.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {formatMoney(slice.value, displayCurrency)}
                      </p>
                      <p className="text-xs text-slate-500">{formatPct(slice.pct, 1)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="rounded-[1.5rem] border border-slate-100 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Holdings</h2>
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
              {([
                { id: 'all', label: 'All' },
                { id: 'crypto', label: 'Crypto' },
                { id: 'stock', label: 'Stocks' },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAssetFilter(option.id)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    assetFilter === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-6 py-3">Asset</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">24h</th>
                  <th className="px-6 py-3">Quantity</th>
                  <th className="px-6 py-3">Market Value</th>
                  <th className="px-6 py-3">Allocation</th>
                  <th className="px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                      No holdings for this filter yet. Use Invest for crypto and Market for stocks.
                    </td>
                  </tr>
                ) : (
                  filteredHoldings.map((holding) => (
                    <tr key={holding.id} className="border-t border-slate-100 text-sm">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{holding.symbol}</p>
                          <span
                            className={[
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                              holding.assetType === 'stock'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700',
                            ].join(' ')}
                          >
                            {holding.assetType}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {holding.assetType === 'crypto' ? holding.coinId : 'stock asset'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {formatPrice(holding.currentPrice, displayCurrency)}
                      </td>
                      <td className={['px-6 py-4 font-semibold', getPriceColorClassName(holding.change24h)].join(' ')}>
                        {formatPct(holding.change24h)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">{formatQty(holding.quantity, holding.symbol)}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {formatMoney(holding.marketValue, displayCurrency)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">{formatPct(holding.allocationPct, 1)}</td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHolding(holding);
                            setTradeSide('sell');
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Sell
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
          <h2 className="text-lg font-semibold text-slate-900">Recent Trades</h2>
          <div className="mt-4 space-y-3">
            {trades.length === 0 ? (
              <p className="text-sm text-slate-500">No trades yet.</p>
            ) : (
              trades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {trade.side.toUpperCase()} {trade.symbol}
                    </p>
                    <p className="text-xs text-slate-500">
                      {trade.assetType.toUpperCase()} • {new Date(trade.createdAt || Date.now()).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={[
                        'font-semibold',
                        trade.side === 'buy' ? 'text-rose-600' : 'text-emerald-600',
                      ].join(' ')}
                    >
                      {trade.side === 'buy' ? '-' : '+'}
                      {formatMoney(trade.total, displayCurrency)}
                    </p>
                    <p className="text-xs text-slate-500">Qty {formatQty(trade.quantity, trade.symbol)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {isTopUpOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Top up investing</h3>
                <p className="mt-1 text-sm text-slate-500">Convert RON to EUR and add funds to your invest cash.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isTopUpSubmitting) {
                    setIsTopUpOpen(false);
                  }
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close top-up modal"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="block text-sm font-medium text-slate-600">
                Amount (RON)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={topUpAmountInput}
                  onChange={(event) => setTopUpAmountInput(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Rate (EUR per 1 RON)</span>
                  <span className="font-semibold text-slate-900">
                    {isTopUpQuoteLoading
                      ? 'Loading...'
                      : topUpQuote
                        ? topUpQuote.rate.toFixed(6)
                        : '--'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-slate-600">
                  <span>Estimated EUR</span>
                  <span className="font-semibold text-slate-900">
                    {isTopUpQuoteLoading
                      ? 'Loading...'
                      : topUpQuote
                        ? formatMoney(topUpQuote.estimatedEUR, 'EUR')
                        : '--'}
                  </span>
                </div>
              </div>

              {topUpError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {topUpError}
                </div>
              ) : null}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!isTopUpSubmitting) {
                      setIsTopUpOpen(false);
                    }
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleTopUpSubmit();
                  }}
                  disabled={isTopUpSubmitting || parsedTopUpAmount <= 0}
                  className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isTopUpSubmitting ? 'Adding...' : 'Confirm top-up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <TradeOrderModal
        isOpen={Boolean(selectedHolding)}
        side={tradeSide}
        onSideChange={setTradeSide}
        coinId={
          selectedHolding?.assetType === 'crypto'
            ? selectedHolding?.coinId ?? selectedHolding?.symbol ?? ''
            : selectedHolding?.symbol ?? ''
        }
        symbol={selectedHolding?.symbol ?? ''}
        coinName={
          selectedHolding?.assetType === 'stock'
            ? `${selectedHolding?.symbol ?? ''} stock`
            : selectedHolding?.coinId ?? ''
        }
        currentPrice={selectedHolding?.currentPrice ?? null}
        cashBalance={totals.cashBalance}
        maxQuantity={selectedHolding?.quantity ?? null}
        pricingCurrency={displayCurrency}
        isSubmitting={isSubmittingOrder}
        onClose={() => {
          if (!isSubmittingOrder) {
            setSelectedHolding(null);
            setTradeSide('sell');
          }
        }}
        onSubmit={handleTradeSubmit}
      />
    </AppShell>
  );
}
