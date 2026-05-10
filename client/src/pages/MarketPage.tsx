import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../components/AppShell';
import { TradeOrderModal } from '../components/TradeOrderModal';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  fetchInvestHoldings,
  fetchStockCandles,
  fetchStockProfile,
  fetchStockQuotes,
  fetchStockSearch,
  placeInvestStockOrder,
  type PortfolioAccount,
  type PortfolioHolding,
  type StockCandlePoint,
  type StockChartRange,
  type StockCompanyProfile,
  type StockQuote,
  type StockSearchResult,
} from '../lib/api';
import { formatCompactNumber, formatMoney, formatPct, formatPrice } from '../lib/formatters';

const DEFAULT_WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
] as const;

const STOCK_RANGES: { id: StockChartRange; label: string }[] = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'ALL' },
];

const STOCK_TABS = [
  { id: 'all', label: 'All Assets', disabled: true },
  { id: 'stocks', label: 'Stocks', disabled: false },
  { id: 'crypto', label: 'Crypto', disabled: true },
  { id: 'etf', label: 'ETFs', disabled: true },
] as const;

type DisplayStock = {
  symbol: string;
  name: string;
  type: string;
};

const resolveDisplayCurrency = (currency: string | null | undefined): 'USD' | 'EUR' => {
  const normalizedCurrency = String(currency || '').trim().toUpperCase();

  if (normalizedCurrency === 'EUR') {
    return 'EUR';
  }

  return 'USD';
};

const getChangeTextClassName = (value: number | null | undefined) => {
  if (typeof value !== 'number') {
    return 'text-slate-500 dark:text-slate-400';
  }

  return value >= 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';
};

function StockChart({ points, isLoading }: { points: StockCandlePoint[]; isLoading: boolean }) {
  const width = 780;
  const height = 280;
  const padding = 24;

  const polyline = useMemo(() => {
    if (points.length === 0) {
      return '';
    }

    const values = points.map((point) => point.c);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return points
      .map((point, index) => {
        const x =
          points.length === 1
            ? width / 2
            : padding + (index / (points.length - 1)) * (width - padding * 2);
        const y = height - padding - ((point.c - min) / range) * (height - padding * 2);

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-700" />;
  }

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
        No chart data for this symbol/time range. Try 1M or another symbol.
      </div>
    );
  }

  return (
    <div className="h-72 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-700/60">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <polyline points={polyline} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function MarketPage() {
  const { accessToken } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [quotesBySymbol, setQuotesBySymbol] = useState<Record<string, StockQuote>>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string>('AAPL');
  const [selectedRange, setSelectedRange] = useState<StockChartRange>('1M');
  const [selectedProfile, setSelectedProfile] = useState<StockCompanyProfile | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<StockQuote | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<StockCandlePoint[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingListQuotes, setIsLoadingListQuotes] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [portfolioAccount, setPortfolioAccount] = useState<PortfolioAccount | null>(null);
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const searchRequestIdRef = useRef(0);
  const quoteRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const refreshPortfolioContext = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const holdingsPayload = await fetchInvestHoldings(accessToken);
    setPortfolioAccount(holdingsPayload.account);
    setPortfolioHoldings(holdingsPayload.holdings);
  }, [accessToken]);

  useEffect(() => {
    void refreshPortfolioContext().catch((caughtError) => {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to load portfolio balance right now.',
      );
    });
  }, [refreshPortfolioContext]);

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

    const normalizedSearch = debouncedSearch.trim();

    if (!normalizedSearch) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    const controller = new AbortController();
    setIsSearching(true);

    void fetchStockSearch(normalizedSearch, accessToken, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (searchRequestIdRef.current !== requestId) {
          return;
        }

        setSearchResults(payload.results);
      })
      .catch((caughtError) => {
        if (searchRequestIdRef.current !== requestId) {
          return;
        }

        if (caughtError instanceof ApiRequestError && caughtError.code === 'REQUEST_ABORTED') {
          return;
        }

        setError(
          caughtError instanceof ApiRequestError
            ? caughtError.message
            : 'Unable to search stock symbols right now.',
        );
      })
      .finally(() => {
        if (searchRequestIdRef.current === requestId) {
          setIsSearching(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, debouncedSearch]);

  const displayedStocks = useMemo<DisplayStock[]>(() => {
    if (!debouncedSearch.trim()) {
      return DEFAULT_WATCHLIST.map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        type: 'Common Stock',
      }));
    }

    return searchResults.map((result) => ({
      symbol: result.symbol,
      name: result.description || result.symbol,
      type: result.type || 'Stock',
    }));
  }, [debouncedSearch, searchResults]);

  const displayedSymbols = useMemo(
    () => displayedStocks.map((stock) => stock.symbol).filter(Boolean),
    [displayedStocks],
  );

  useEffect(() => {
    if (displayedSymbols.length === 0) {
      return;
    }

    if (!displayedSymbols.includes(selectedSymbol)) {
      setSelectedSymbol(displayedSymbols[0]);
      setSelectedRange('1M');
    }
  }, [displayedSymbols, selectedSymbol]);

  useEffect(() => {
    if (!accessToken || displayedSymbols.length === 0) {
      return;
    }

    const requestId = quoteRequestIdRef.current + 1;
    quoteRequestIdRef.current = requestId;

    const controller = new AbortController();
    setIsLoadingListQuotes(true);

    void fetchStockQuotes(displayedSymbols, accessToken, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (quoteRequestIdRef.current !== requestId) {
          return;
        }

        setQuotesBySymbol((previous) => {
          const next = { ...previous };

          payload.quotes.forEach((quote) => {
            next[quote.symbol] = quote;
          });

          return next;
        });
      })
      .catch((caughtError) => {
        if (quoteRequestIdRef.current !== requestId) {
          return;
        }

        if (caughtError instanceof ApiRequestError && caughtError.code === 'REQUEST_ABORTED') {
          return;
        }

        setError(
          caughtError instanceof ApiRequestError
            ? caughtError.message
            : 'Unable to load watchlist quotes right now.',
        );
      })
      .finally(() => {
        if (quoteRequestIdRef.current === requestId) {
          setIsLoadingListQuotes(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, displayedSymbols]);

  useEffect(() => {
    if (!accessToken || !selectedSymbol) {
      return;
    }

    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;

    const controller = new AbortController();
    setIsLoadingDetail(true);

    void Promise.allSettled([
      fetchStockProfile(selectedSymbol, accessToken, { signal: controller.signal }),
      fetchStockQuotes([selectedSymbol], accessToken, { signal: controller.signal }),
      fetchStockCandles(selectedSymbol, selectedRange, accessToken, { signal: controller.signal }),
    ])
      .then((results) => {
        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        const [profileResult, quoteResult, candlesResult] = results;

        if (profileResult.status === 'fulfilled') {
          setSelectedProfile(profileResult.value.profile);
        }

        if (quoteResult.status === 'fulfilled') {
          const quote = quoteResult.value.quotes[0] ?? null;
          setSelectedQuote(quote);

          if (quote?.symbol) {
            setQuotesBySymbol((previous) => ({
              ...previous,
              [quote.symbol]: quote,
            }));
          }
        }

        if (candlesResult.status === 'fulfilled') {
          setSelectedSeries(candlesResult.value.series);
        } else {
          setSelectedSeries([]);
        }

        if (
          profileResult.status === 'rejected' &&
          quoteResult.status === 'rejected' &&
          candlesResult.status === 'rejected'
        ) {
          const firstError = profileResult.reason;

          setError(
            firstError instanceof ApiRequestError
              ? firstError.message
              : 'Unable to load selected stock details right now.',
          );
          return;
        }

        setError(null);
      })
      .finally(() => {
        if (detailRequestIdRef.current === requestId) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, selectedRange, selectedSymbol]);

  const selectedStock = useMemo(
    () => displayedStocks.find((stock) => stock.symbol === selectedSymbol) ?? null,
    [displayedStocks, selectedSymbol],
  );
  const selectedStockHolding = useMemo(
    () =>
      portfolioHoldings.find(
        (holding) => holding.assetType === 'stock' && holding.symbol === selectedSymbol,
      ) ?? null,
    [portfolioHoldings, selectedSymbol],
  );

  const detailSourceCurrency = resolveDisplayCurrency(selectedProfile?.currency || 'USD');
  const portfolioSourceCurrency = 'EUR';

  const marketCapValue = useMemo(() => {
    if (typeof selectedProfile?.marketCap !== 'number' || !Number.isFinite(selectedProfile.marketCap)) {
      return null;
    }

    return selectedProfile.marketCap * 1_000_000;
  }, [selectedProfile?.marketCap]);

  const handleStockOrderSubmit = async ({
    side,
    quantity,
  }: {
    side: 'buy' | 'sell';
    quantity: number;
  }) => {
    if (!accessToken || !selectedSymbol) {
      return;
    }

    setIsSubmittingOrder(true);

    try {
      await placeInvestStockOrder({ symbol: selectedSymbol, side, quantity }, accessToken);
      await refreshPortfolioContext();
      setIsTradeModalOpen(false);
      setSuccessMessage('Stock demo order executed.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <AppShell activeTab="market">
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb] dark:text-blue-400">Market</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Stocks Discovery</h1>
          <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">Browse live stock data, compare movers, and inspect trend charts.</p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400">{error}</div>
        ) : null}
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
            {successMessage}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
              Search stocks
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search Apple, Tesla, AAPL..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {STOCK_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  disabled={tab.disabled}
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    tab.id === 'stocks'
                      ? 'bg-[#2563eb] text-white dark:bg-blue-600'
                      : 'bg-slate-100 text-slate-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-700 dark:text-slate-400',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {isSearching || isLoadingListQuotes ? (
                Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
                ))
              ) : displayedStocks.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
                  No stocks found for this search.
                </p>
              ) : (
                displayedStocks.map((stock) => {
                  const quote = quotesBySymbol[stock.symbol];
                  const isActive = stock.symbol === selectedSymbol;

                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      onClick={() => setSelectedSymbol(stock.symbol)}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                        isActive
                          ? 'border-[#2563eb] bg-blue-50 dark:border-blue-500 dark:bg-blue-950/60'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700/40 dark:hover:border-slate-500 dark:hover:bg-slate-700',
                      ].join(' ')}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {stock.symbol.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{stock.symbol}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{stock.name}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {typeof quote?.price === 'number' ? formatPrice(quote.price, 'USD') : '--'}
                        </p>
                        <p className={['text-xs font-semibold', getChangeTextClassName(quote?.changePct)].join(' ')}>
                          {formatPct(quote?.changePct, 2)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            {!selectedStock ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-400">
                Select a stock from the list to view details.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                        {selectedProfile?.name || selectedStock.name}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {selectedStock.symbol}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {selectedProfile?.exchange || 'Exchange unavailable'}
                      {selectedProfile?.finnhubIndustry ? ` • ${selectedProfile.finnhubIndustry}` : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                      {typeof selectedQuote?.price === 'number'
                        ? formatPrice(selectedQuote.price, detailSourceCurrency)
                        : '--'}
                    </p>
                    <p className={['mt-1 text-sm font-semibold', getChangeTextClassName(selectedQuote?.changePct)].join(' ')}>
                      {formatPct(selectedQuote?.changePct, 2)} (
                      {formatMoney(selectedQuote?.change ?? null, detailSourceCurrency)}
                      )
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {STOCK_RANGES.map((range) => (
                    <button
                      key={range.id}
                      type="button"
                      onClick={() => setSelectedRange(range.id)}
                      className={[
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                        range.id === selectedRange
                          ? 'bg-[#2563eb] text-white dark:bg-blue-600'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
                      ].join(' ')}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  <StockChart points={selectedSeries} isLoading={isLoadingDetail} />
                </div>

                <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3 dark:border-slate-600 dark:bg-slate-700/40">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Market Cap</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapValue !== null
                        ? formatMoney(marketCapValue, detailSourceCurrency)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Volume</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {typeof selectedQuote?.volume === 'number'
                        ? formatCompactNumber(selectedQuote.volume)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">P/E</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">—</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled
                    title="Stock demo trading is disabled for now."
                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Demo Buy
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Stock demo trading is disabled for now."
                    className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Demo Sell
                  </button>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-400">
                    Buying power:{' '}
                    <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(portfolioAccount?.cashBalance ?? 0, portfolioSourceCurrency)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </article>
        </section>
      </div>

      <TradeOrderModal
        isOpen={isTradeModalOpen && Boolean(selectedStock)}
        side={tradeSide}
        onSideChange={setTradeSide}
        coinId={selectedStock?.symbol ?? ''}
        symbol={selectedStock?.symbol ?? ''}
        coinName={selectedProfile?.name || selectedStock?.name || ''}
        currentPrice={typeof selectedQuote?.price === 'number' ? selectedQuote.price : null}
        cashBalance={portfolioAccount?.cashBalance ?? 0}
        maxQuantity={selectedStockHolding?.quantity ?? 0}
        pricingCurrency={detailSourceCurrency}
        isSubmitting={isSubmittingOrder}
        onClose={() => {
          if (!isSubmittingOrder) {
            setIsTradeModalOpen(false);
          }
        }}
        onSubmit={handleStockOrderSubmit}
      />
    </AppShell>
  );
}
