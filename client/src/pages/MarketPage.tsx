import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../components/AppShell';
import { TradeOrderModal } from '../components/TradeOrderModal';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  fetchInvestingWallet,
  fetchMarketAccount,
  fetchMarketHoldings,
  fetchMarketPerformance,
  fetchMarketStocksState,
  fetchMarketStockExecutionQuote,
  fetchMarketTrades,
  fetchStockCandles,
  fetchStockProfile,
  fetchStockQuotes,
  fetchStockSearch,
  placeMarketStockOrder,
  resetMarketDemoPortfolio,
  setMarketStocksDemoBudget,
  setMarketStocksMode,
  topUpMarketFromWallet,
  type InvestStockExecutionQuote,
  type MarketAccountOverview,
  type MarketStocksMode,
  type MarketStocksState,
  type MarketPerformancePoint,
  type PortfolioAccount,
  type PortfolioHolding,
  type PortfolioTrade,
  type StockCandlePoint,
  type StockChartRange,
  type StockCompanyProfile,
  type StockQuote,
  type StockSearchResult,
} from '../lib/api';
import { formatMoney, formatPct, formatPrice, formatQty } from '../lib/formatters';

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
  { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'ALL' },
];
const STOCK_RANGE_POINTS: Record<StockChartRange, number> = {
  '1D': 2,
  '1W': 7,
  '1M': 30,
  '6M': 180,
  '1Y': 365,
  ALL: 365 * 2,
};

const PERFORMANCE_RANGES = [
  { id: '7d' as const, label: '7D' },
  { id: '30d' as const, label: '30D' },
];

const SYMBOL_ALLOCATION_COLORS = [
  '#2563eb',
  '#22c55e',
  '#8b5cf6',
  '#f97316',
  '#14b8a6',
  '#eab308',
  '#94a3b8',
];

const MAX_SYMBOL_ALLOCATION_SLICES = 6;

type DisplayStock = {
  symbol: string;
  name: string;
  type: string;
};

type SymbolAllocationSlice = {
  id: string;
  label: string;
  value: number;
  pct: number;
  color: string;
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
    return 'text-slate-500';
  }

  return value >= 0 ? 'text-emerald-600' : 'text-rose-600';
};

const getOpportunityTag = (symbol: string) => {
  const mapping: Record<string, string> = {
    AAPL: 'Tech',
    MSFT: 'Cloud',
    NVDA: 'AI',
    TSLA: 'Growth',
    AMZN: 'Consumer',
  };

  return mapping[symbol.toUpperCase()] ?? 'Stock';
};

const buildSymbolAllocation = (holdings: PortfolioHolding[]) => {
  const stocks = holdings
    .filter((holding) => holding.assetType === 'stock')
    .map((holding) => ({
      id: holding.id,
      label: holding.symbol,
      value: Math.max(0, holding.marketValue),
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

  const top = stocks.slice(0, MAX_SYMBOL_ALLOCATION_SLICES);
  const otherValue = stocks
    .slice(MAX_SYMBOL_ALLOCATION_SLICES)
    .reduce((sum, item) => sum + item.value, 0);

  const slices = top.map((item, index) => ({
    ...item,
    color: SYMBOL_ALLOCATION_COLORS[index % SYMBOL_ALLOCATION_COLORS.length],
  }));

  if (otherValue > 0) {
    slices.push({
      id: 'other',
      label: 'Other',
      value: otherValue,
      color: SYMBOL_ALLOCATION_COLORS[slices.length % SYMBOL_ALLOCATION_COLORS.length],
    });
  }

  const total = slices.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return {
      total: 0,
      slices: [] as SymbolAllocationSlice[],
    };
  }

  return {
    total,
    slices: slices.map((item) => ({
      ...item,
      pct: (item.value / total) * 100,
    })),
  };
};

const buildDonutBackground = (slices: SymbolAllocationSlice[]) => {
  if (slices.length === 0) {
    return '#e2e8f0';
  }

  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    cursor += slice.pct;
    return `${slice.color} ${start.toFixed(3)}% ${Math.min(cursor, 100).toFixed(3)}%`;
  });

  return `conic-gradient(${stops.join(', ')})`;
};

const buildQuoteFallbackSeries = ({
  price,
  range,
  symbol,
}: {
  price: number;
  range: StockChartRange;
  symbol: string;
}): StockCandlePoint[] => {
  if (!Number.isFinite(price) || price <= 0) {
    return [];
  }

  const pointsCount = Math.max(2, STOCK_RANGE_POINTS[range] ?? STOCK_RANGE_POINTS['1M']);
  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const seedText = String(symbol || '').toUpperCase();
  let hash = 0;

  for (let index = 0; index < seedText.length; index += 1) {
    hash = ((hash << 5) - hash + seedText.charCodeAt(index)) | 0;
  }

  let state = (Math.abs(hash) % 2147483647) || 1;
  const nextRandom = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  const denominator = Math.max(pointsCount - 1, 1);
  const volatilityPct = 0.004 + ((Math.abs(hash) % 6) * 0.0012);
  const driftPerStep = ((nextRandom() - 0.5) * 0.016) / denominator;
  const cycles = 2 + (Math.abs(hash) % 4);
  const phaseShift = ((Math.abs(hash) % 360) * Math.PI) / 180;
  let runningPrice = price * (0.97 + (nextRandom() * 0.06));

  const rawSeries = Array.from({ length: pointsCount }, (_value, index) => {
    const progress = index / denominator;
    const wave = Math.sin((progress * Math.PI * 2 * cycles) + phaseShift) * volatilityPct * 0.35;
    const noise = (nextRandom() - 0.5) * 2 * volatilityPct;
    const stepReturn = driftPerStep + wave + noise;
    runningPrice = Math.max(0.01, runningPrice * (1 + stepReturn));

    return {
      t: todayUtcMs - ((pointsCount - 1 - index) * 24 * 60 * 60 * 1000),
      c: runningPrice,
    };
  });

  const lastPrice = rawSeries[rawSeries.length - 1]?.c ?? price;
  const adjustmentFactor = price / Math.max(lastPrice, 0.01);

  return rawSeries.map((point) => ({
    t: point.t,
    c: Number((point.c * adjustmentFactor).toFixed(4)),
  }));
};

function PortfolioPerformanceChart({
  points,
  isLoading,
}: {
  points: MarketPerformancePoint[];
  isLoading: boolean;
}) {
  const width = 740;
  const height = 260;
  const padding = 24;

  const polyline = useMemo(() => {
    if (points.length === 0) {
      return '';
    }

    const sortedPoints = [...points].sort((left, right) => left.t - right.t);
    const values = sortedPoints.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;
    const minT = sortedPoints[0].t;
    const maxT = sortedPoints[sortedPoints.length - 1].t;
    const tRange = maxT - minT || 1;

    return sortedPoints
      .map((point) => {
        const x =
          sortedPoints.length === 1
            ? width / 2
            : padding + ((point.t - minT) / tRange) * (width - padding * 2);
        const y = height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2);

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  return (
    <div className="h-64 rounded-2xl border border-slate-200 bg-slate-50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <polyline points={polyline} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function StockSparkline({
  points,
  isLoading,
  isUnavailable,
}: {
  points: StockCandlePoint[];
  isLoading: boolean;
  isUnavailable: boolean;
}) {
  const width = 360;
  const height = 104;
  const padding = 10;

  const sparkline = useMemo(() => {
    if (points.length === 0) {
      return {
        polyline: '',
        areaPoints: '',
        startPoint: null as { x: number; y: number } | null,
        endPoint: null as { x: number; y: number } | null,
      };
    }

    const sortedPoints = [...points]
      .filter((point) => Number.isFinite(Number(point?.c)))
      .sort((left, right) => Number(left.t) - Number(right.t));

    if (sortedPoints.length === 0) {
      return {
        polyline: '',
        areaPoints: '',
        startPoint: null as { x: number; y: number } | null,
        endPoint: null as { x: number; y: number } | null,
      };
    }

    const values = sortedPoints.map((point) => Number(point.c));
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const domainPadding = Math.max((maxValue - minValue) * 0.15, Math.max(maxValue * 0.006, 0.2));
    const domainMin = minValue - domainPadding;
    const domainMax = maxValue + domainPadding;
    const domainRange = Math.max(domainMax - domainMin, 1e-6);

    const toY = (value: number) =>
      height - padding - ((value - domainMin) / domainRange) * (height - padding * 2);

    const chartPoints = sortedPoints.map((point, index) => {
        const x =
          sortedPoints.length === 1
            ? width / 2
            : padding + (index / (sortedPoints.length - 1)) * (width - padding * 2);
        const y = toY(Number(point.c));

        return { x, y };
      });

    const startPoint = chartPoints[0] ?? null;
    const endPoint = chartPoints[chartPoints.length - 1] ?? null;
    const baseY = height - padding;

    return {
      polyline: chartPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
      areaPoints:
        chartPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
        + ` ${(endPoint?.x ?? width - padding).toFixed(2)},${baseY.toFixed(2)}`
        + ` ${(startPoint?.x ?? padding).toFixed(2)},${baseY.toFixed(2)}`,
      startPoint,
      endPoint,
    };
  }, [points]);

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  }

  if (isUnavailable) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
        Chart unavailable.
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
        No chart data yet.
      </div>
    );
  }

  return (
    <div className="h-24 rounded-xl border border-slate-200 bg-slate-50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <defs>
          <linearGradient id="market-stock-sparkline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {sparkline.areaPoints ? (
          <polygon points={sparkline.areaPoints} fill="url(#market-stock-sparkline-fill)" />
        ) : null}
        <polyline
          points={sparkline.polyline}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sparkline.startPoint ? (
          <circle cx={sparkline.startPoint.x} cy={sparkline.startPoint.y} r="2.2" fill="#1d4ed8" opacity="0.65" />
        ) : null}
        {sparkline.endPoint ? (
          <circle cx={sparkline.endPoint.x} cy={sparkline.endPoint.y} r="2.6" fill="#1d4ed8" />
        ) : null}
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
  const [selectedExecutionQuote, setSelectedExecutionQuote] = useState<InvestStockExecutionQuote | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<StockCandlePoint[]>([]);
  const [isSelectedSeriesUnavailable, setIsSelectedSeriesUnavailable] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingListQuotes, setIsLoadingListQuotes] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(true);
  const [marketState, setMarketState] = useState<MarketStocksState | null>(null);
  const [selectedMode, setSelectedMode] = useState<MarketStocksMode | null>(null);
  const [portfolioAccount, setPortfolioAccount] = useState<PortfolioAccount | null>(null);
  const [marketAccount, setMarketAccount] = useState<MarketAccountOverview | null>(null);
  const [marketPerformanceRange, setMarketPerformanceRange] = useState<'7d' | '30d'>('7d');
  const [marketPerformanceSeries, setMarketPerformanceSeries] = useState<MarketPerformancePoint[]>([]);
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioTrades, setPortfolioTrades] = useState<PortfolioTrade[]>([]);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isLoadingWalletBalance, setIsLoadingWalletBalance] = useState(false);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [topUpAmountRONInput, setTopUpAmountRONInput] = useState('100');
  const [walletBalanceRON, setWalletBalanceRON] = useState(0);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isDemoBudgetModalOpen, setIsDemoBudgetModalOpen] = useState(false);
  const [demoBudgetInput, setDemoBudgetInput] = useState('5000');
  const [isSettingDemoBudget, setIsSettingDemoBudget] = useState(false);
  const [demoBudgetError, setDemoBudgetError] = useState<string | null>(null);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const quoteRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const refreshPortfolioContext = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoadingPortfolio(true);

    try {
      const statePayload = await fetchMarketStocksState(accessToken);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setMarketState(statePayload);
      setSelectedMode(statePayload.selectedMode);

      if (!statePayload.selectedMode) {
        setPortfolioAccount(null);
        setMarketAccount(null);
        setPortfolioHoldings([]);
        setPortfolioTrades([]);
        setMarketPerformanceSeries([]);
        setError(null);
        return;
      }

      const [holdingsPayload, tradesPayload, accountPayload, performancePayload] = await Promise.all([
        fetchMarketHoldings(accessToken),
        fetchMarketTrades(accessToken, 10),
        fetchMarketAccount(accessToken),
        fetchMarketPerformance(accessToken, marketPerformanceRange),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setPortfolioAccount(holdingsPayload.account);
      setPortfolioHoldings(holdingsPayload.holdings);
      setPortfolioTrades(tradesPayload.trades);
      setMarketAccount({
        cashBalanceEUR: accountPayload.cashBalanceEUR,
        portfolioValueEUR: accountPayload.portfolioValueEUR,
        dayPnL: accountPayload.dayPnL,
        dayPnLPct: accountPayload.dayPnLPct,
      });
      setMarketPerformanceSeries(performancePayload.series);
      setError(null);
    } catch (caughtError) {
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to load stock portfolio data right now.',
      );
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoadingPortfolio(false);
      }
    }
  }, [accessToken, marketPerformanceRange]);

  useEffect(() => {
    void refreshPortfolioContext();
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
    if (!accessToken || !selectedMode || displayedSymbols.length === 0) {
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
  }, [accessToken, displayedSymbols, selectedMode]);

  useEffect(() => {
    if (!accessToken || !selectedMode || !selectedSymbol) {
      return;
    }

    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;

    const controller = new AbortController();
    setIsLoadingDetail(true);
    setSelectedExecutionQuote(null);
    setIsSelectedSeriesUnavailable(false);

    void Promise.allSettled([
      fetchStockProfile(selectedSymbol, accessToken, {
        signal: controller.signal,
      }),
      fetchStockQuotes([selectedSymbol], accessToken, {
        signal: controller.signal,
      }),
      fetchMarketStockExecutionQuote(selectedSymbol, accessToken),
      fetchStockCandles(selectedSymbol, selectedRange, accessToken, {
        signal: controller.signal,
      }),
    ])
      .then((results) => {
        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        const [profileResult, quoteResult, executionQuoteResult, candlesResult] = results;

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

        if (executionQuoteResult.status === 'fulfilled') {
          setSelectedExecutionQuote(executionQuoteResult.value);
        } else {
          setSelectedExecutionQuote(null);
        }

        if (candlesResult.status === 'fulfilled') {
          setSelectedSeries(candlesResult.value.series);
          setIsSelectedSeriesUnavailable(false);
        } else {
          setSelectedSeries([]);
          setIsSelectedSeriesUnavailable(true);
        }

        if (
          profileResult.status === 'rejected' &&
          quoteResult.status === 'rejected' &&
          executionQuoteResult.status === 'rejected' &&
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
  }, [accessToken, selectedMode, selectedRange, selectedSymbol]);

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
  const displaySeries = useMemo(() => {
    if (selectedSeries.length > 0) {
      return selectedSeries;
    }

    if (typeof selectedQuote?.price === 'number') {
      return buildQuoteFallbackSeries({
        price: selectedQuote.price,
        range: selectedRange,
        symbol: selectedSymbol,
      });
    }

    return [];
  }, [selectedQuote?.price, selectedRange, selectedSeries, selectedSymbol]);
  const isSparklineUnavailable = isSelectedSeriesUnavailable && displaySeries.length === 0;
  const selectedSeriesStats = useMemo(() => {
    if (displaySeries.length === 0) {
      return null;
    }

    const values = displaySeries.map((point) => Number(point.c)).filter(Number.isFinite);

    if (values.length === 0) {
      return null;
    }

    const first = values[0];
    const last = values[values.length - 1];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

    return { low, high, changePct };
  }, [displaySeries]);

  const marketCapValue = useMemo(() => {
    if (typeof selectedProfile?.marketCap !== 'number' || !Number.isFinite(selectedProfile.marketCap)) {
      return null;
    }

    return selectedProfile.marketCap * 1_000_000;
  }, [selectedProfile?.marketCap]);

  const allocation = useMemo(() => buildSymbolAllocation(portfolioHoldings), [portfolioHoldings]);
  const allocationDonut = useMemo(() => buildDonutBackground(allocation.slices), [allocation.slices]);

  const sortedPerformancePoints = useMemo(
    () => [...marketPerformanceSeries].sort((left, right) => left.t - right.t),
    [marketPerformanceSeries],
  );

  const derivedHoldingsTotal = useMemo(
    () => portfolioHoldings.reduce((sum, holding) => sum + Math.max(0, holding.marketValue), 0),
    [portfolioHoldings],
  );

  const buyingPowerEUR = marketAccount?.cashBalanceEUR ?? portfolioAccount?.cashBalance ?? 0;
  const portfolioValueEUR = marketAccount?.portfolioValueEUR ?? buyingPowerEUR + derivedHoldingsTotal;
  const dayPnLEUR = marketAccount?.dayPnL ?? 0;
  const dayPnLPct = marketAccount?.dayPnLPct ?? 0;
  const investedAmountEUR = derivedHoldingsTotal;
  const topHoldings = useMemo(
    () =>
      [...portfolioHoldings]
        .filter((holding) => holding.assetType === 'stock')
        .sort((left, right) => right.marketValue - left.marketValue)
        .slice(0, 6),
    [portfolioHoldings],
  );
  const bestPerformerHolding = useMemo(
    () =>
      [...portfolioHoldings]
        .filter((holding) => holding.assetType === 'stock' && typeof holding.change24h === 'number')
        .sort((left, right) => (right.change24h ?? Number.NEGATIVE_INFINITY) - (left.change24h ?? Number.NEGATIVE_INFINITY))[0] ?? null,
    [portfolioHoldings],
  );
  const latestTrade = portfolioTrades[0] ?? null;
  const opportunities = useMemo(() => displayedStocks.slice(0, 8), [displayedStocks]);
  const selectedStockName = selectedProfile?.name || selectedStock?.name || selectedSymbol;
  const parsedDemoBudget = useMemo(() => {
    const numericAmount = Number(demoBudgetInput);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return 0;
    }

    return numericAmount;
  }, [demoBudgetInput]);
  const selectedModeLabel =
    selectedMode === 'demo' ? 'Demo Practice' : selectedMode === 'funded' ? 'Start Investing' : null;

  const handleOpenTopUpModal = () => {
    if (!accessToken || selectedMode !== 'funded') {
      return;
    }

    setTopUpAmountRONInput('100');
    setIsTopUpModalOpen(true);
    setIsLoadingWalletBalance(true);

    void fetchInvestingWallet(accessToken)
      .then((wallet) => {
        setWalletBalanceRON(wallet.balance);
      })
      .catch((caughtError) => {
        setError(
          caughtError instanceof ApiRequestError
            ? caughtError.message
            : 'Unable to load investing wallet balance right now.',
        );
      })
      .finally(() => {
        setIsLoadingWalletBalance(false);
      });
  };

  const handleTopUpFromWallet = async () => {
    if (!accessToken || isSubmittingTopUp || selectedMode !== 'funded') {
      return;
    }

    const amountRON = Number(topUpAmountRONInput);

    if (!Number.isFinite(amountRON) || amountRON <= 0) {
      setError('Enter a valid top-up amount in RON.');
      return;
    }

    setIsSubmittingTopUp(true);

    try {
      const result = await topUpMarketFromWallet(amountRON, accessToken);
      setWalletBalanceRON(result.walletBalanceRON);
      setIsTopUpModalOpen(false);
      await refreshPortfolioContext();
      setSuccessMessage(
        `Converted ${formatMoney(result.amountRON, 'RON')} and topped up ${formatMoney(result.toppedUpEUR, 'EUR')} to Start Investing cash.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to top up from investing wallet right now.',
      );
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

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
      await placeMarketStockOrder(
        {
          symbol: selectedSymbol,
          side,
          quantity,
        },
        accessToken,
      );

      await refreshPortfolioContext();
      setIsTradeModalOpen(false);
      setSuccessMessage('Stock order executed.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleResetDemo = async () => {
    if (!accessToken || isResettingDemo || selectedMode !== 'demo') {
      return;
    }

    const shouldProceed = window.confirm(
      'This will reset your stock Demo Practice mode to €5,000 and remove stock holdings/trades.',
    );

    if (!shouldProceed) {
      return;
    }

    setIsResettingDemo(true);

    try {
      await resetMarketDemoPortfolio(accessToken);
      await refreshPortfolioContext();
      setSuccessMessage('Demo Practice mode reset to €5,000.');
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to reset stock demo portfolio right now.',
      );
    } finally {
      setIsResettingDemo(false);
    }
  };

  const handleChooseMode = async (mode: MarketStocksMode) => {
    if (!accessToken || isSwitchingMode) {
      return;
    }

    setIsSwitchingMode(true);

    try {
      await setMarketStocksMode(mode, accessToken);
      setSelectedMode(mode);
      setPortfolioAccount(null);
      setMarketAccount(null);
      setPortfolioHoldings([]);
      setPortfolioTrades([]);
      setMarketPerformanceSeries([]);
      await refreshPortfolioContext();
      setSuccessMessage(`Mode changed to ${mode === 'demo' ? 'Demo Practice' : 'Start Investing'}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to switch mode right now.',
      );
    } finally {
      setIsSwitchingMode(false);
    }
  };

  const handleSetDemoBudget = async () => {
    if (!accessToken || isSettingDemoBudget || selectedMode !== 'demo') {
      return;
    }

    if (!Number.isFinite(parsedDemoBudget) || parsedDemoBudget <= 0) {
      setDemoBudgetError('Enter a valid amount greater than zero.');
      return;
    }

    setIsSettingDemoBudget(true);
    setDemoBudgetError(null);

    try {
      await setMarketStocksDemoBudget(parsedDemoBudget, accessToken);
      setIsDemoBudgetModalOpen(false);
      await refreshPortfolioContext();
      setSuccessMessage(`Demo budget set to ${formatMoney(parsedDemoBudget, 'EUR')}.`);
    } catch (caughtError) {
      setDemoBudgetError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to set demo budget right now.',
      );
    } finally {
      setIsSettingDemoBudget(false);
    }
  };

  const openInvestNow = () => {
    if (!selectedStock || !selectedMode) {
      return;
    }

    setTradeSide('buy');
    setIsTradeModalOpen(true);
  };

  return (
    <AppShell activeTab="market">
      <div className="fv-page space-y-6">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb]">Market</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Stock Investing</h1>
            <p className="mt-2 max-w-2xl text-base text-slate-500 dark:text-slate-400">
              Build your long-term wealth with precision and clarity. Choose Start Investing for wallet-funded cash or Demo Practice for simulated capital.
            </p>
            <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
              <button
                type="button"
                disabled={isSwitchingMode}
                onClick={() => {
                  void handleChooseMode('funded');
                }}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  selectedMode === 'funded'
                    ? 'bg-[#2563eb] text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                Start Investing
              </button>
              <button
                type="button"
                disabled={isSwitchingMode}
                onClick={() => {
                  void handleChooseMode('demo');
                }}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  selectedMode === 'demo'
                    ? 'bg-[#2563eb] text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                Demo Practice
              </button>
            </div>
            {selectedModeLabel ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Active mode: {selectedModeLabel}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {STOCK_RANGES.map((range) => (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => setSelectedRange(range.id)}
                  className={[
                    'rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                    selectedRange === range.id
                      ? 'bg-[#2563eb] text-white'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                  ].join(' ')}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={openInvestNow}
              disabled={!selectedStock || !selectedMode}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              Invest now
            </button>
            {selectedMode === 'funded' ? (
              <button
                type="button"
                onClick={handleOpenTopUpModal}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Convert & Top up
              </button>
            ) : null}
            {selectedMode === 'demo' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDemoBudgetInput(String(marketState?.accounts.demo.cashBalanceEUR ?? 5000));
                    setDemoBudgetError(null);
                    setIsDemoBudgetModalOpen(true);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-indigo-300 px-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                >
                  Set demo budget
                </button>
                <button
                  type="button"
                  disabled={isResettingDemo}
                  onClick={() => {
                    void handleResetDemo();
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResettingDemo ? 'Resetting...' : 'Reset demo'}
                </button>
              </>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}
        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {selectedMode ? (
          <section className="grid grid-cols-12 gap-6">
          <article className="relative col-span-12 overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-8">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total Balance</p>
            <p className="mt-2 text-4xl font-bold tracking-[-0.03em] text-slate-900">
              {isLoadingPortfolio ? '...' : formatMoney(portfolioValueEUR, 'EUR')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className={['font-semibold', getChangeTextClassName(dayPnLEUR)].join(' ')}>
                {isLoadingPortfolio ? '--' : `${dayPnLEUR >= 0 ? '+' : ''}${formatMoney(dayPnLEUR, 'EUR')} (${formatPct(dayPnLPct, 2)})`}
              </span>
              <span className="text-slate-500">Today</span>
            </div>
            <div className="mt-4">
              <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                {PERFORMANCE_RANGES.map((range) => (
                  <button
                    key={range.id}
                    type="button"
                    onClick={() => setMarketPerformanceRange(range.id)}
                    className={[
                      'rounded-md px-2.5 py-1 font-semibold transition',
                      marketPerformanceRange === range.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    ].join(' ')}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <PortfolioPerformanceChart points={sortedPerformancePoints} isLoading={isLoadingPortfolio} />
            </div>
          </article>

          <aside className="col-span-12 grid gap-4 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Buy Power</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{isLoadingPortfolio ? '--' : formatMoney(buyingPowerEUR, 'EUR')}</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Invested Amount</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{isLoadingPortfolio ? '--' : formatMoney(investedAmountEUR, 'EUR')}</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Total Return</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">—</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Best Performer</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-lg font-semibold text-slate-900">{bestPerformerHolding?.symbol ?? '—'}</p>
                <p className={['text-sm font-semibold', getChangeTextClassName(bestPerformerHolding?.change24h)].join(' ')}>
                  {bestPerformerHolding ? formatPct(bestPerformerHolding.change24h, 2) : '—'}
                </p>
              </div>
            </article>
          </aside>

          <article className="col-span-12 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Sector Allocation</h2>
              <span className="text-xs text-slate-500">Fallback: symbols</span>
            </div>
            <div className="mt-5 flex items-center justify-center">
              <div className="relative h-44 w-44 rounded-full" style={{ background: allocationDonut }}>
                <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatMoney(allocation.total, portfolioSourceCurrency)}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {allocation.slices.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  No allocation yet.
                </p>
              ) : (
                allocation.slices.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{formatPct(item.pct, 1)}</span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="col-span-12 rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Top Holdings</h2>
              <button
                type="button"
                disabled
                className="text-sm font-semibold text-slate-400 disabled:cursor-not-allowed"
              >
                Full Portfolio
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Asset</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Price</th>
                    <th className="px-6 py-3">Change (24h)</th>
                    <th className="px-6 py-3">Market Value</th>
                  </tr>
                </thead>
                <tbody>
                  {topHoldings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                        No stock holdings yet. Place a buy order to start.
                      </td>
                    </tr>
                  ) : (
                    topHoldings.map((holding) => (
                      <tr key={holding.id} className="border-t border-slate-100 text-sm">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">{holding.symbol}</p>
                          <p className="text-xs text-slate-500">{holding.symbol}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{formatQty(holding.quantity, holding.symbol)}</td>
                        <td className="px-6 py-4 text-slate-700">{formatMoney(holding.currentPrice, portfolioSourceCurrency)}</td>
                        <td className={['px-6 py-4 font-semibold', getChangeTextClassName(holding.change24h)].join(' ')}>
                          {formatPct(holding.change24h, 2)}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {formatMoney(holding.marketValue, portfolioSourceCurrency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article id="market-discovery" className="col-span-12 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Discover Opportunities</h2>
              <label className="w-full max-w-xs">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search Apple, Tesla, NVDA..."
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Selected Opportunity</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{selectedStockName}</p>
                  <p className="text-xs text-slate-500">{selectedSymbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-900">
                    {typeof selectedQuote?.price === 'number' ? formatPrice(selectedQuote.price, detailSourceCurrency) : '--'}
                  </p>
                  <p className={['text-xs font-semibold', getChangeTextClassName(selectedQuote?.changePct)].join(' ')}>
                    {formatPct(selectedQuote?.changePct, 2)}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <StockSparkline
                  points={displaySeries}
                  isLoading={isLoadingDetail}
                  isUnavailable={isSparklineUnavailable}
                />
                {selectedSeriesStats ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      {selectedRange}:{' '}
                      <span className={['font-semibold', getChangeTextClassName(selectedSeriesStats.changePct)].join(' ')}>
                        {formatPct(selectedSeriesStats.changePct, 2)}
                      </span>
                    </span>
                    <span>
                      Low {formatPrice(selectedSeriesStats.low, detailSourceCurrency)} | High {formatPrice(selectedSeriesStats.high, detailSourceCurrency)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
              {isSearching || isLoadingListQuotes ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-36 w-[180px] flex-shrink-0 animate-pulse rounded-xl bg-slate-100" />
                ))
              ) : opportunities.length === 0 ? (
                <p className="text-sm text-slate-500">No stocks found for this search.</p>
              ) : (
                opportunities.map((stock) => {
                  const quote = quotesBySymbol[stock.symbol];
                  const isActive = stock.symbol === selectedSymbol;

                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      onClick={() => setSelectedSymbol(stock.symbol)}
                      className={[
                        'w-[200px] flex-shrink-0 snap-start rounded-xl border p-3 text-left transition',
                        isActive
                          ? 'border-[#2563eb] bg-blue-50'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{stock.symbol}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          {getOpportunityTag(stock.symbol)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{stock.name}</p>
                      <p className="mt-3 text-base font-semibold text-slate-900">
                        {typeof quote?.price === 'number' ? formatPrice(quote.price, 'USD') : '--'}
                      </p>
                      <p className={['text-xs font-semibold', getChangeTextClassName(quote?.changePct)].join(' ')}>
                        {formatPct(quote?.changePct, 2)}
                      </p>
                      <div className="mt-3 h-9 rounded-lg bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200" />
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <section className="col-span-12 grid grid-cols-12 gap-6">
            <article className="col-span-12 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Execution Suite</p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  disabled={!selectedStock}
                  onClick={() => {
                    setTradeSide('buy');
                    setIsTradeModalOpen(true);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  Buy Stocks
                </button>
                <button
                  type="button"
                  disabled={!selectedStock}
                  onClick={() => {
                    setTradeSide('sell');
                    setIsTradeModalOpen(true);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sell Assets
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-400"
                >
                  Recurring Investment (Soon)
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-400"
                >
                  Price Alert (Soon)
                </button>
              </div>
            </article>

            <article className="col-span-12 grid gap-4 xl:col-span-8 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Market Update</p>
                <p className="mt-3 text-sm text-slate-700">
                  S&P 500 reached a fresh high as large-cap earnings stayed resilient across technology and retail.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {latestTrade
                    ? `Last trade: ${latestTrade.side.toUpperCase()} ${latestTrade.symbol} (${new Date(latestTrade.createdAt || Date.now()).toLocaleDateString()})`
                    : 'No recent trades yet.'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sector Strength</p>
                <p className="mt-3 text-sm text-slate-700">
                  Tech and communication services continue to show relative strength while defensives remain stable.
                </p>
                <div className="mt-3 text-xs text-slate-500">
                  {marketCapValue !== null
                    ? `Selected ${selectedSymbol} market cap: ${formatMoney(marketCapValue, detailSourceCurrency)}`
                    : 'Heat map module coming soon.'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Investment Strategy</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Dividend reinvestment can compound wealth over time. Learn how to automate your DCA/DRIP process.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
                  >
                    Start Guide
                  </button>
                </div>
              </div>
            </article>
          </section>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-slate-900">Choose a mode to begin</h2>
            <p className="mt-2 text-sm text-slate-500">
              Start Investing begins at €0 and is funded by Budget wallet conversion. Demo Practice starts with €5,000.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSwitchingMode}
                onClick={() => {
                  void handleChooseMode('funded');
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Start Investing
              </button>
              <button
                type="button"
                disabled={isSwitchingMode}
                onClick={() => {
                  void handleChooseMode('demo');
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Demo Practice
              </button>
            </div>
          </section>
        )}
      </div>

      <TradeOrderModal
        isOpen={isTradeModalOpen && Boolean(selectedStock)}
        side={tradeSide}
        onSideChange={setTradeSide}
        coinId={selectedStock?.symbol ?? ''}
        symbol={selectedStock?.symbol ?? ''}
        coinName={selectedProfile?.name || selectedStock?.name || ''}
        currentPrice={selectedExecutionQuote?.priceEUR ?? null}
        marketPrice={typeof selectedQuote?.price === 'number' ? selectedQuote.price : null}
        marketPriceCurrency={detailSourceCurrency}
        cashBalance={buyingPowerEUR}
        maxQuantity={selectedStockHolding?.quantity ?? 0}
        pricingCurrency={portfolioSourceCurrency}
        isSubmitting={isSubmittingOrder}
        onClose={() => {
          if (!isSubmittingOrder) {
            setIsTradeModalOpen(false);
          }
        }}
        onSubmit={handleStockOrderSubmit}
      />

      {isTopUpModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">Top up from Budget</h3>
            <p className="mt-2 text-sm text-slate-500">
              Convert RON from Investing Wallet into EUR buying power for Stocks account.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="text-slate-500">Available wallet balance</p>
              <p className="mt-1 font-semibold text-slate-900">
                {isLoadingWalletBalance ? 'Loading...' : formatMoney(walletBalanceRON, 'RON')}
              </p>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Amount (RON)
              <input
                type="number"
                min="0"
                step="0.01"
                value={topUpAmountRONInput}
                onChange={(event) => setTopUpAmountRONInput(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTopUpModalOpen(false)}
                disabled={isSubmittingTopUp}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleTopUpFromWallet();
                }}
                disabled={isSubmittingTopUp || isLoadingWalletBalance}
                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingTopUp ? 'Converting...' : 'Top up'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDemoBudgetModalOpen ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">Set demo budget</h3>
            <p className="mt-2 text-sm text-slate-500">
              This resets Demo Practice holdings/trades and applies a new starting EUR cash balance.
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Demo budget (EUR)
              <input
                type="number"
                min="0"
                step="0.01"
                value={demoBudgetInput}
                onChange={(event) => setDemoBudgetInput(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            {demoBudgetError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {demoBudgetError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDemoBudgetModalOpen(false)}
                disabled={isSettingDemoBudget}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSetDemoBudget();
                }}
                disabled={isSettingDemoBudget}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSettingDemoBudget ? 'Applying...' : 'Apply budget'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
