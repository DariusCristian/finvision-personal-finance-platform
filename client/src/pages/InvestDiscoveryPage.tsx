import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { TradeOrderModal } from '../components/TradeOrderModal';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  fetchCryptoChart,
  fetchCryptoQuotes,
  fetchInvestHoldings,
  placeInvestOrder,
  searchCryptoMarket,
  type CryptoChartPoint,
  type CryptoQuote,
  type CryptoSearchCoin,
  type PortfolioHolding,
  type PortfolioTotals,
} from '../lib/api';
import { formatMoney, formatPct, formatPrice, formatQty } from '../lib/formatters';

const PAGE_TITLE = 'Invest';
const DEFAULT_MARKET_QUERY = 'bitcoin';
const CHART_RANGES = [
  { id: 1 as const, label: '1D' },
  { id: 7 as const, label: '1W' },
  { id: 30 as const, label: '1M' },
  { id: 365 as const, label: '1Y' },
];

const EMPTY_TOTALS: PortfolioTotals = {
  cashBalance: 0,
  holdingsValue: 0,
  totalValue: 0,
  unrealizedPnL: 0,
  holdingsCount: 0,
};

function AssetChart({ points, isLoading }: { points: CryptoChartPoint[]; isLoading: boolean }) {
  const width = 760;
  const height = 260;
  const padding = 24;

  const polyline = useMemo(() => {
    if (points.length === 0) {
      return '';
    }

    const values = points.map((point) => point.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return points
      .map((point, index) => {
        const x =
          points.length === 1
            ? width / 2
            : padding + (index / (points.length - 1)) * (width - padding * 2);
        const y = height - padding - ((point.price - min) / range) * (height - padding * 2);

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-700" />;
  }

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
        No chart data available.
      </div>
    );
  }

  return (
    <div className="h-64 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-700/60">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <polyline points={polyline} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function InvestDiscoveryPage() {
  const { accessToken } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [coins, setCoins] = useState<CryptoSearchCoin[]>([]);
  const [selectedCoinId, setSelectedCoinId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<CryptoQuote | null>(null);
  const [chartRange, setChartRange] = useState<1 | 7 | 30 | 365>(7);
  const [chartPoints, setChartPoints] = useState<CryptoChartPoint[]>([]);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [totals, setTotals] = useState<PortfolioTotals>(EMPTY_TOTALS);
  const [isLoadingSearch, setIsLoadingSearch] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const searchRequestCounterRef = useRef(0);

  const sourcePricingCurrency = 'EUR';

  const selectedCoin = useMemo(
    () => coins.find((coin) => coin.coinId === selectedCoinId) ?? null,
    [coins, selectedCoinId],
  );

  const selectedHolding = useMemo(
    () => holdings.find((holding) => holding.coinId === selectedCoinId) ?? null,
    [holdings, selectedCoinId],
  );

  const refreshPortfolioContext = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const holdingsPayload = await fetchInvestHoldings(accessToken);
    setHoldings(holdingsPayload.holdings);
    setTotals(holdingsPayload.totals);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void refreshPortfolioContext().catch((caughtError) => {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to load portfolio context.',
      );
    });
  }, [accessToken, refreshPortfolioContext]);

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const requestId = searchRequestCounterRef.current + 1;
    searchRequestCounterRef.current = requestId;

    const controller = new AbortController();
    setIsLoadingSearch(true);

    void searchCryptoMarket(
      {
        q: debouncedSearch || DEFAULT_MARKET_QUERY,
      },
      accessToken,
      {
        signal: controller.signal,
      },
    )
      .then((payload) => {
        if (searchRequestCounterRef.current !== requestId) {
          return;
        }

        setCoins(payload.coins);

        setSelectedCoinId((currentId) => {
          if (payload.coins.length === 0) {
            return null;
          }

          if (currentId && payload.coins.some((coin) => coin.coinId === currentId)) {
            return currentId;
          }

          return payload.coins[0].coinId;
        });
      })
      .catch((caughtError) => {
        if (searchRequestCounterRef.current !== requestId) {
          return;
        }

        const isAbort =
          caughtError instanceof ApiRequestError && caughtError.code === 'REQUEST_ABORTED';

        if (isAbort) {
          return;
        }

        setError(
          caughtError instanceof ApiRequestError
            ? caughtError.message
            : 'Unable to load crypto market list.',
        );
      })
      .finally(() => {
        if (searchRequestCounterRef.current === requestId) {
          setIsLoadingSearch(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, debouncedSearch]);

  useEffect(() => {
    if (!accessToken || !selectedCoin) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingDetail(true);

    const preferredVs = 'eur';

    void Promise.all([
      fetchCryptoQuotes([selectedCoin.coinId], accessToken, {
        vs: preferredVs,
        signal: controller.signal,
      }),
      fetchCryptoChart(selectedCoin.coinId, accessToken, {
        vs: preferredVs,
        days: chartRange,
        signal: controller.signal,
      }),
    ])
      .then(([quotePayload, chartPayload]) => {
        setSelectedQuote(quotePayload.quotes[selectedCoin.coinId] ?? null);
        setChartPoints(chartPayload.points);
      })
      .catch((caughtError) => {
        const isAbort =
          caughtError instanceof ApiRequestError && caughtError.code === 'REQUEST_ABORTED';

        if (isAbort) {
          return;
        }

        setError(
          caughtError instanceof ApiRequestError
            ? caughtError.message
            : 'Unable to load selected asset details.',
        );
        setSelectedQuote(null);
        setChartPoints([]);
      })
      .finally(() => {
        setIsLoadingDetail(false);
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, chartRange, selectedCoin]);

  const handlePlaceOrder = async ({ side, quantity }: { side: 'buy' | 'sell'; quantity: number }) => {
    if (!accessToken || !selectedCoin) {
      return;
    }

    setIsSubmittingOrder(true);

    try {
      await placeInvestOrder(
        {
          coinId: selectedCoin.coinId,
          symbol: selectedCoin.symbol,
          side,
          quantity,
        },
        accessToken,
      );

      await refreshPortfolioContext();
      setIsOrderModalOpen(false);
      setSuccessMessage('Order executed.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <AppShell activeTab="invest">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb] dark:text-blue-400">{PAGE_TITLE}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Crypto Discovery</h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
              Explore crypto assets, inspect live quotes, and place demo buy/sell orders.
            </p>
          </div>
          <Link
            to="/invest"
            className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Back to Portfolio
          </Link>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
            {successMessage}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-2">
              <button type="button" className="rounded-full bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white dark:bg-blue-600">
                Crypto
              </button>
              <button
                type="button"
                disabled
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              >
                All Assets (Soon)
              </button>
            </div>

            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
              Search assets
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search bitcoin, ethereum..."
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-blue-900/40"
              />
            </label>

            <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {isLoadingSearch ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
                ))
              ) : coins.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
                  No assets found for this search.
                </p>
              ) : (
                coins.map((coin) => {
                  const isActive = coin.coinId === selectedCoinId;

                  return (
                    <button
                      key={coin.coinId}
                      type="button"
                      onClick={() => setSelectedCoinId(coin.coinId)}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                        isActive
                          ? 'border-[#2563eb] bg-blue-50 dark:border-blue-500 dark:bg-blue-950/60'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500 dark:hover:bg-slate-700',
                      ].join(' ')}
                    >
                      <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-700">
                        {coin.thumb ? (
                          <img src={coin.thumb} alt={`${coin.name} logo`} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{coin.name}</p>
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{coin.symbol}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            {selectedCoin ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{selectedCoin.symbol}</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                      {selectedCoin.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">CoinGecko ID: {selectedCoin.coinId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                      {selectedQuote
                        ? formatPrice(selectedQuote.price, sourcePricingCurrency)
                        : '--'}
                    </p>
                    <p
                      className={[
                        'mt-1 text-sm font-semibold',
                        typeof selectedQuote?.change24h === 'number' && selectedQuote.change24h >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600',
                      ].join(' ')}
                    >
                      {formatPct(selectedQuote?.change24h ?? null)} (24h)
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {CHART_RANGES.map((range) => (
                    <button
                      key={range.id}
                      type="button"
                      onClick={() => setChartRange(range.id)}
                      className={[
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                        range.id === chartRange
                          ? 'bg-[#2563eb] text-white dark:bg-blue-600'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600',
                      ].join(' ')}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  <AssetChart points={chartPoints} isLoading={isLoadingDetail} />
                </div>

                <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700/60 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Your Balance</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(totals.cashBalance, sourcePricingCurrency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Holding Quantity</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {selectedHolding ? formatQty(selectedHolding.quantity, selectedHolding.symbol) : '0'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSide('buy');
                      setIsOrderModalOpen(true);
                    }}
                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSide('sell');
                      setIsOrderModalOpen(true);
                    }}
                    className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
                  >
                    Sell
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
                Select a crypto asset to view quote and chart.
              </div>
            )}
          </article>
        </section>
      </div>

      <TradeOrderModal
        isOpen={isOrderModalOpen && Boolean(selectedCoin)}
        side={orderSide}
        onSideChange={setOrderSide}
        coinId={selectedCoin?.coinId ?? ''}
        symbol={selectedCoin?.symbol ?? ''}
        coinName={selectedCoin?.name ?? ''}
        currentPrice={
          selectedQuote ? selectedQuote.price : null
        }
        cashBalance={totals.cashBalance}
        maxQuantity={orderSide === 'sell' ? selectedHolding?.quantity ?? 0 : null}
        pricingCurrency={sourcePricingCurrency}
        isSubmitting={isSubmittingOrder}
        onClose={() => {
          if (!isSubmittingOrder) {
            setIsOrderModalOpen(false);
          }
        }}
        onSubmit={handlePlaceOrder}
      />
    </AppShell>
  );
}
