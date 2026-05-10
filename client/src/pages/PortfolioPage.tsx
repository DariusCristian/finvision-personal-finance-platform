import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { TradeOrderModal } from '../components/TradeOrderModal';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  exportInvestCsv,
  fetchCryptoQuotes,
  fetchInvestCryptoState,
  fetchInvestHoldings,
  fetchInvestPerformance,
  fetchInvestTrades,
  fetchInvestingWallet,
  fetchInvestingWalletConvertQuote,
  placeInvestOrder,
  resetDemoPortfolio,
  searchCryptoMarket,
  setInvestCryptoDemoBudget,
  setInvestCryptoMode,
  topUpInvestCryptoFromWallet,
  type CryptoQuote,
  type CryptoSearchCoin,
  type InvestCryptoMode,
  type InvestCryptoState,
  type InvestPerformancePoint,
  type InvestingWallet,
  type InvestingWalletConvertQuote,
  type PortfolioHolding,
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

const ALLOCATION_COLORS = ['#2563eb', '#22c55e', '#8b5cf6', '#f97316', '#14b8a6', '#eab308', '#94a3b8'];
const MAX_CRYPTO_ALLOCATION_SLICES = 5;
const DISCOVERY_PREVIEW_LIMIT = 6;

type AllocationSlice = {
  id: string;
  label: string;
  subtitle: string | null;
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

const formatAllocationPct = (value: number) =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}%`;

const toCoinName = (coinId: string | null, symbol: string) => {
  if (!coinId) {
    return symbol;
  }

  return coinId
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
};

const buildCryptoAllocation = (holdings: PortfolioHolding[]) => {
  const cryptoHoldings = holdings.filter((holding) => holding.assetType === 'crypto' || !holding.assetType);

  const sorted = cryptoHoldings
    .map((holding) => ({
      id: holding.id,
      symbol: holding.symbol,
      coinId: holding.coinId ?? null,
      value: Math.max(0, holding.marketValue),
    }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value);

  const topCoins = sorted.slice(0, MAX_CRYPTO_ALLOCATION_SLICES);
  const otherValue = sorted.slice(MAX_CRYPTO_ALLOCATION_SLICES).reduce((sum, entry) => sum + entry.value, 0);

  const rawSlices = topCoins.map((entry, index) => ({
    id: entry.id,
    label: entry.symbol,
    subtitle: toCoinName(entry.coinId, entry.symbol),
    value: entry.value,
    color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
  }));

  if (otherValue > 0) {
    rawSlices.push({
      id: 'other',
      label: 'Other',
      subtitle: 'Other',
      value: otherValue,
      color: ALLOCATION_COLORS[(rawSlices.length + 1) % ALLOCATION_COLORS.length],
    });
  }

  const totalCryptoEUR = rawSlices.reduce((sum, slice) => sum + slice.value, 0);

  if (totalCryptoEUR <= 0) {
    return {
      totalCryptoEUR: 0,
      slices: [] as AllocationSlice[],
    };
  }

  return {
    totalCryptoEUR,
    slices: rawSlices.map((slice) => ({
      ...slice,
      pct: (slice.value / totalCryptoEUR) * 100,
    })),
  };
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

function PerformanceChart({ points, isLoading }: { points: InvestPerformancePoint[]; isLoading: boolean }) {
  const width = 680;
  const height = 240;
  const padding = 24;

  const pathData = useMemo(() => {
    if (points.length === 0) {
      return '';
    }

    const sortedPoints = [...points].sort((left, right) => left.t - right.t);
    const values = sortedPoints.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const minT = sortedPoints[0].t;
    const maxT = sortedPoints[sortedPoints.length - 1].t;
    const tRange = maxT - minT || 1;

    return sortedPoints
      .map((point) => {
        const x =
          sortedPoints.length === 1
            ? width / 2
            : padding + ((point.t - minT) / tRange) * (width - padding * 2);
        const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
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
  const loadRequestRef = useRef(0);
  const discoveryPreviewRequestRef = useRef(0);
  const [investState, setInvestState] = useState<InvestCryptoState | null>(null);
  const [selectedMode, setSelectedMode] = useState<InvestCryptoMode | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [holdingsSearchInput, setHoldingsSearchInput] = useState('');
  const [totals, setTotals] = useState<PortfolioTotals>(EMPTY_TOTALS);
  const [performanceSeries, setPerformanceSeries] = useState<InvestPerformancePoint[]>([]);
  const [performanceRange, setPerformanceRange] = useState<'7d' | '30d'>('7d');
  const [trades, setTrades] = useState<PortfolioTrade[]>([]);
  const [discoveryPreviewCoins, setDiscoveryPreviewCoins] = useState<CryptoSearchCoin[]>([]);
  const [discoveryPreviewQuotes, setDiscoveryPreviewQuotes] = useState<Record<string, CryptoQuote>>({});
  const [isLoadingDiscoveryPreview, setIsLoadingDiscoveryPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<PortfolioHolding | null>(null);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('sell');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isResettingPortfolio, setIsResettingPortfolio] = useState(false);
  const [budgetInvestingWallet, setBudgetInvestingWallet] = useState<Pick<InvestingWallet, 'balance' | 'monthlyGoal'> | null>(null);
  const [isBudgetWalletLoading, setIsBudgetWalletLoading] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmountInput, setTopUpAmountInput] = useState('0');
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [topUpQuote, setTopUpQuote] = useState<InvestingWalletConvertQuote | null>(null);
  const [isTopUpQuoteLoading, setIsTopUpQuoteLoading] = useState(false);
  const [isTopUpSubmitting, setIsTopUpSubmitting] = useState(false);

  const [isSwitchingMode, setIsSwitchingMode] = useState(false);

  const [isDemoBudgetModalOpen, setIsDemoBudgetModalOpen] = useState(false);
  const [demoBudgetInput, setDemoBudgetInput] = useState('5000');
  const [isSettingDemoBudget, setIsSettingDemoBudget] = useState(false);
  const [demoBudgetError, setDemoBudgetError] = useState<string | null>(null);

  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [investExportRange, setInvestExportRange] = useState<'month' | 'all'>('month');

  const displayCurrency = 'EUR';

  const walletBalanceRON = budgetInvestingWallet?.balance ?? 0;

  const parsedTopUpAmount = useMemo(() => {
    const numericAmount = Number(topUpAmountInput);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return 0;
    }

    return numericAmount;
  }, [topUpAmountInput]);

  const parsedDemoBudget = useMemo(() => {
    const numericAmount = Number(demoBudgetInput);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return 0;
    }

    return numericAmount;
  }, [demoBudgetInput]);

  const refreshBudgetWallet = useCallback(async () => {
    if (!accessToken) {
      return null;
    }

    setIsBudgetWalletLoading(true);

    try {
      const walletPayload = await fetchInvestingWallet(accessToken);
      setBudgetInvestingWallet({
        balance: walletPayload.balance,
        monthlyGoal: walletPayload.monthlyGoal,
      });
      return walletPayload;
    } finally {
      setIsBudgetWalletLoading(false);
    }
  }, [accessToken]);

  const loadInvestData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    setIsLoading(true);
    setError(null);

    try {
      const statePayload = await fetchInvestCryptoState(accessToken);

      if (loadRequestRef.current !== requestId) {
        return;
      }

      setInvestState(statePayload);
      setSelectedMode(statePayload.selectedMode);

      if (!statePayload.selectedMode) {
        setHoldings([]);
        setTotals(EMPTY_TOTALS);
        setPerformanceSeries([]);
        setTrades([]);
        await refreshBudgetWallet().catch(() => null);
        return;
      }

      const [holdingsPayload, performancePayload, tradesPayload] = await Promise.all([
        fetchInvestHoldings(accessToken),
        fetchInvestPerformance(accessToken, performanceRange),
        fetchInvestTrades(accessToken, 10),
      ]);

      if (loadRequestRef.current !== requestId) {
        return;
      }

      setHoldings(holdingsPayload.holdings);
      setTotals(holdingsPayload.totals);
      setPerformanceSeries(performancePayload.series);
      setTrades(tradesPayload.trades);
      await refreshBudgetWallet().catch(() => null);
    } catch (caughtError) {
      if (loadRequestRef.current !== requestId) {
        return;
      }

      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to load invest data right now.',
      );
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [accessToken, performanceRange, refreshBudgetWallet]);

  useEffect(() => {
    void loadInvestData();
  }, [loadInvestData]);

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
    if (!isTopUpOpen || !accessToken) {
      return;
    }

    if (parsedTopUpAmount <= 0) {
      setTopUpQuote(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsTopUpQuoteLoading(true);
      setTopUpError(null);

      void fetchInvestingWalletConvertQuote(parsedTopUpAmount, accessToken)
        .then((quotePayload) => {
          setTopUpQuote(quotePayload);
        })
        .catch((caughtError) => {
          setTopUpQuote(null);
          setTopUpError(
            caughtError instanceof ApiRequestError
              ? caughtError.message
              : 'Unable to fetch conversion quote right now.',
          );
        })
        .finally(() => {
          setIsTopUpQuoteLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, isTopUpOpen, parsedTopUpAmount]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const requestId = discoveryPreviewRequestRef.current + 1;
    discoveryPreviewRequestRef.current = requestId;
    const controller = new AbortController();

    setIsLoadingDiscoveryPreview(true);

    void searchCryptoMarket(
      {
        q: 'bitcoin',
      },
      accessToken,
      {
        signal: controller.signal,
      },
    )
      .then(async (searchPayload) => {
        if (discoveryPreviewRequestRef.current !== requestId) {
          return;
        }

        const previewCoins = searchPayload.coins.slice(0, DISCOVERY_PREVIEW_LIMIT);
        setDiscoveryPreviewCoins(previewCoins);

        if (previewCoins.length === 0) {
          setDiscoveryPreviewQuotes({});
          return;
        }

        const quotePayload = await fetchCryptoQuotes(
          previewCoins.map((coin) => coin.coinId),
          accessToken,
          {
            vs: 'eur',
            signal: controller.signal,
          },
        );

        if (discoveryPreviewRequestRef.current !== requestId) {
          return;
        }

        setDiscoveryPreviewQuotes(quotePayload.quotes);
      })
      .catch((caughtError) => {
        if (discoveryPreviewRequestRef.current !== requestId) {
          return;
        }

        const isAbort =
          caughtError instanceof ApiRequestError && caughtError.code === 'REQUEST_ABORTED';

        if (isAbort) {
          return;
        }

        setDiscoveryPreviewCoins([]);
        setDiscoveryPreviewQuotes({});
      })
      .finally(() => {
        if (discoveryPreviewRequestRef.current === requestId) {
          setIsLoadingDiscoveryPreview(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken]);

  const hasEnoughHistory = performanceSeries.length > 1;
  const chartPoints = useMemo(
    () => [...performanceSeries].sort((left, right) => left.t - right.t),
    [performanceSeries],
  );

  const cryptoAllocation = useMemo(() => buildCryptoAllocation(holdings), [holdings]);
  const allocationSlices = cryptoAllocation.slices;
  const filteredHoldings = useMemo(() => {
    const normalizedSearch = holdingsSearchInput.trim().toLowerCase();

    if (!normalizedSearch) {
      return holdings;
    }

    return holdings.filter((holding) => (
      holding.symbol.toLowerCase().includes(normalizedSearch) ||
      (holding.coinId ?? '').toLowerCase().includes(normalizedSearch)
    ));
  }, [holdings, holdingsSearchInput]);
  const recentTrades = useMemo(() => trades.slice(0, 5), [trades]);

  const handleChooseMode = async (mode: InvestCryptoMode) => {
    if (!accessToken || isSwitchingMode) {
      return;
    }

    setIsSwitchingMode(true);

    try {
      await setInvestCryptoMode(mode, accessToken);
      setSelectedMode(mode);
      setHoldings([]);
      setTotals(EMPTY_TOTALS);
      setPerformanceSeries([]);
      setTrades([]);
      await loadInvestData();
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

  const handleOpenTopUpModal = async () => {
    setTopUpError(null);
    const walletPayload = await refreshBudgetWallet().catch((caughtError) => {
      setTopUpError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to load Budget investing wallet balance.',
      );
      return null;
    });

    const availableBalance = walletPayload?.balance ?? walletBalanceRON;
    const suggestedAmount = availableBalance > 0 ? Math.min(availableBalance, 100) : 0;

    setTopUpAmountInput(String(suggestedAmount));
    setTopUpQuote(null);
    setIsTopUpOpen(true);
  };

  const handleTopUpSubmit = async () => {
    if (!accessToken || isTopUpSubmitting) {
      return;
    }

    if (!Number.isFinite(parsedTopUpAmount) || parsedTopUpAmount <= 0) {
      setTopUpError('Enter an amount greater than zero.');
      return;
    }

    if (parsedTopUpAmount > walletBalanceRON) {
      setTopUpError('Amount exceeds available Budget investing wallet balance.');
      return;
    }

    setIsTopUpSubmitting(true);
    setTopUpError(null);

    try {
      const topUpPayload = await topUpInvestCryptoFromWallet(parsedTopUpAmount, accessToken);
      setIsTopUpOpen(false);
      await loadInvestData();
      setSuccessMessage(
        `Converted ${formatMoney(topUpPayload.fromAmountRON, 'RON')} and topped up ${formatMoney(
          topUpPayload.addedEUR,
          'EUR',
        )} to Start Investing cash.`,
      );
    } catch (caughtError) {
      setTopUpError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to convert and top up right now.',
      );
    } finally {
      setIsTopUpSubmitting(false);
    }
  };

  const handleSetDemoBudget = async () => {
    if (!accessToken || isSettingDemoBudget) {
      return;
    }

    if (!Number.isFinite(parsedDemoBudget) || parsedDemoBudget <= 0) {
      setDemoBudgetError('Enter a valid amount greater than zero.');
      return;
    }

    setIsSettingDemoBudget(true);
    setDemoBudgetError(null);

    try {
      await setInvestCryptoDemoBudget(parsedDemoBudget, accessToken);
      setIsDemoBudgetModalOpen(false);
      await loadInvestData();
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
      await placeInvestOrder(
        {
          coinId: selectedHolding.coinId ?? selectedHolding.symbol.toLowerCase(),
          symbol: selectedHolding.symbol,
          side,
          quantity,
        },
        accessToken,
      );

      await loadInvestData();
      setSelectedHolding(null);
      setTradeSide('sell');
      setSuccessMessage('Order executed.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleResetPortfolio = async () => {
    if (!accessToken || isResettingPortfolio || selectedMode !== 'demo') {
      return;
    }

    const shouldProceed = window.confirm(
      'This will reset Demo mode to €5,000 and remove demo holdings and trades. Continue?',
    );

    if (!shouldProceed) {
      return;
    }

    setIsResettingPortfolio(true);

    try {
      await resetDemoPortfolio(accessToken);
      await loadInvestData();
      setSelectedHolding(null);
      setTradeSide('sell');
      setSuccessMessage('Demo mode reset to €5,000.');
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to reset demo mode right now.',
      );
    } finally {
      setIsResettingPortfolio(false);
    }
  };

  const handleExportInvestCsv = async () => {
    if (!accessToken || isExportingCsv) {
      return;
    }

    setIsExportingCsv(true);
    setSuccessMessage('Export started...');

    try {
      const now = new Date();
      const query =
        investExportRange === 'month'
          ? {
              range: 'month' as const,
              year: now.getUTCFullYear(),
              month: now.getUTCMonth() + 1,
            }
          : { range: 'all' as const };

      const { blob, filename } = await exportInvestCsv(query, accessToken);
      downloadCsvBlob(blob, filename);
      setSuccessMessage('Invest CSV downloaded.');
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiRequestError
          ? caughtError.message
          : 'Unable to export invest CSV right now.',
      );
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <AppShell activeTab="invest">
      <div className="fv-page space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2563eb]">Crypto Invest</p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900">Portfolio</h1>
            <p className="max-w-2xl text-base text-slate-500">
              Simulated crypto investing in EUR. Use Start Investing for wallet-funded cash, or Demo Practice for sandbox capital.
            </p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
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
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            <Link
              to="/invest/discovery"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Crypto Discovery
            </Link>
            {selectedMode === 'funded' ? (
              <button
                type="button"
                onClick={() => {
                  void handleOpenTopUpModal();
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Convert & Top up
              </button>
            ) : null}
            {selectedMode === 'demo' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDemoBudgetInput(String(investState?.accounts.demo.cashBalanceEUR ?? 5000));
                    setDemoBudgetError(null);
                    setIsDemoBudgetModalOpen(true);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-indigo-300 bg-white px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                >
                  Set demo budget
                </button>
                <button
                  type="button"
                  disabled={isResettingPortfolio}
                  onClick={handleResetPortfolio}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResettingPortfolio ? 'Resetting...' : 'Reset demo'}
                </button>
              </>
            ) : null}
            <select
              value={investExportRange}
              onChange={(event) => setInvestExportRange(event.target.value as 'month' | 'all')}
              disabled={isExportingCsv || !selectedMode}
              className={[
                'h-10 rounded-lg border px-3 text-sm outline-none transition',
                isExportingCsv || !selectedMode
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-slate-200 bg-white text-slate-700 focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100',
              ].join(' ')}
            >
              <option value="month">This month</option>
              <option value="all">All time</option>
            </select>
            <button
              type="button"
              disabled={isExportingCsv || !selectedMode}
              onClick={() => {
                void handleExportInvestCsv();
              }}
              className={[
                'inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition',
                isExportingCsv || !selectedMode
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {isExportingCsv ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </header>

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        {selectedMode ? (
          <section className="grid grid-cols-12 gap-6">
            <article className="col-span-12 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Total Portfolio Value</h2>
                  <p className="text-sm text-slate-500">{formatMoney(totals.totalValue, displayCurrency)}</p>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPerformanceRange('7d')}
                    className={[
                      'rounded-md px-2.5 py-1 font-semibold transition',
                      performanceRange === '7d'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    ].join(' ')}
                  >
                    7D
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerformanceRange('30d')}
                    className={[
                      'rounded-md px-2.5 py-1 font-semibold transition',
                      performanceRange === '30d'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    ].join(' ')}
                  >
                    30D
                  </button>
                </div>
              </div>
              <PerformanceChart points={chartPoints} isLoading={isLoading} />
              {!hasEnoughHistory ? (
                <p className="mt-3 text-xs text-slate-500">
                  Building your history. Add more activity or switch to 30D.
                </p>
              ) : null}
            </article>

            <aside className="col-span-12 grid gap-4 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
              <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Portfolio Value (EUR)</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(totals.totalValue, displayCurrency)}</p>
                <p className="mt-1 text-xs text-slate-500">Cash + holdings</p>
              </article>
              <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Buying Power (EUR)</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(totals.cashBalance, displayCurrency)}</p>
                <p className="mt-1 text-xs text-slate-500">Available for buy orders</p>
              </article>
              <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Day&apos;s P/L</p>
                <p className={['mt-2 text-2xl font-bold', totals.unrealizedPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'].join(' ')}>
                  {formatMoney(totals.unrealizedPnL, displayCurrency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Open positions only</p>
              </article>
              <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Total Return %</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">&mdash;</p>
                <p className="mt-1 text-xs text-slate-500">Coming soon</p>
              </article>
            </aside>

            <article className="col-span-12 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-4">
              <h2 className="text-lg font-semibold text-slate-900">Portfolio Allocation</h2>
              <div className="mt-6 flex items-center justify-center">
                <div className="relative h-44 w-44 rounded-full" style={{ background: buildDonutBackground(allocationSlices) }}>
                  <div className="absolute inset-6 flex items-center justify-center rounded-full bg-white text-center">
                    {allocationSlices.length > 0 ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Total Assets</p>
                        <p className="text-base font-semibold text-slate-900">{formatMoney(cryptoAllocation.totalCryptoEUR, displayCurrency)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No allocation yet</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {allocationSlices.length === 0 ? (
                  <p className="text-sm text-slate-500">Place trades to build allocation data.</p>
                ) : (
                  allocationSlices.map((slice) => (
                    <div key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                        <p className="truncate text-slate-700">{slice.label}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{formatAllocationPct(slice.pct)}</p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="col-span-12 rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] xl:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Your Holdings</h2>
                <input
                  type="search"
                  value={holdingsSearchInput}
                  onChange={(event) => setHoldingsSearchInput(event.target.value)}
                  placeholder="Search holdings..."
                  className="h-9 w-full max-w-xs rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
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
                          {holdings.length === 0
                            ? 'No crypto holdings yet. Use Crypto Discovery to start.'
                            : 'No holdings match your search.'}
                        </td>
                      </tr>
                    ) : (
                      filteredHoldings.map((holding) => (
                        <tr key={holding.id} className="border-t border-slate-100 text-sm">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900">{holding.symbol}</p>
                            <p className="text-xs text-slate-500">{holding.coinId}</p>
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
            </article>

            <article className="col-span-12 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Recent Trades</h2>
              </div>
              <div className="space-y-2.5">
                {recentTrades.length === 0 ? (
                  <p className="text-sm text-slate-500">No trades yet.</p>
                ) : (
                  recentTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {trade.side.toUpperCase()} {trade.symbol}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(trade.executedAt || trade.createdAt || Date.now()).toLocaleString()}
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
            </article>

            <article className="col-span-12 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Discover Crypto Assets</h2>
                <Link to="/invest/discovery" className="text-sm font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                  Open discovery
                </Link>
              </div>
              {isLoadingDiscoveryPreview ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: DISCOVERY_PREVIEW_LIMIT }).map((_, index) => (
                    <div key={index} className="h-32 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : discoveryPreviewCoins.length === 0 ? (
                <p className="text-sm text-slate-500">Unable to load market preview right now.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {discoveryPreviewCoins.map((coin) => {
                    const quote = discoveryPreviewQuotes[coin.coinId] ?? null;

                    return (
                      <Link
                        key={coin.coinId}
                        to="/invest/discovery"
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 overflow-hidden rounded-full border border-slate-200 bg-white">
                            {coin.thumb ? <img src={coin.thumb} alt={`${coin.name} logo`} className="h-full w-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{coin.name}</p>
                            <p className="text-xs uppercase text-slate-500">{coin.symbol}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-base font-semibold text-slate-900">
                          {quote ? formatPrice(quote.price, displayCurrency) : '--'}
                        </p>
                        <p className={['text-xs font-semibold', getPriceColorClassName(quote?.change24h ?? null)].join(' ')}>
                          {formatPct(quote?.change24h ?? null)} (24h)
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </article>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-slate-900">Choose a mode to begin</h2>
            <p className="mt-2 text-sm text-slate-500">
              Start Investing begins at €0 and is funded by wallet conversion. Demo Practice starts with €5,000.
            </p>
          </section>
        )}
      </div>

      {isTopUpOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">Convert & Top up</h3>
            <p className="mt-1 text-sm text-slate-500">
              Convert from Budget investing wallet (RON) into Start Investing cash (EUR).
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Available in Budget Investing Account
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {isBudgetWalletLoading ? 'Loading...' : formatMoney(walletBalanceRON, 'RON')}
              </p>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-600">
              Amount (RON)
              <input
                type="number"
                min="0"
                step="0.01"
                max={walletBalanceRON}
                value={topUpAmountInput}
                onChange={(event) => setTopUpAmountInput(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="text-slate-600">
                Rate:{' '}
                <span className="font-semibold text-slate-900">
                  {isTopUpQuoteLoading
                    ? 'Loading...'
                    : topUpQuote
                      ? `1 EUR = ${topUpQuote.rate.ronPerEur ?? '--'} RON`
                      : '--'}
                </span>
              </p>
              <p className="mt-1 text-slate-600">
                You send:{' '}
                <span className="font-semibold text-slate-900">
                  {parsedTopUpAmount > 0 ? formatMoney(parsedTopUpAmount, 'RON') : '--'}
                </span>
              </p>
              <p className="mt-1 text-slate-600">
                You receive:{' '}
                <span className="font-semibold text-slate-900">
                  {isTopUpQuoteLoading || !topUpQuote ? '--' : formatMoney(topUpQuote.eurAmount, 'EUR')}
                </span>
              </p>
            </div>

            {topUpError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {topUpError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTopUpOpen(false)}
                disabled={isTopUpSubmitting}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleTopUpSubmit();
                }}
                disabled={isTopUpSubmitting || parsedTopUpAmount <= 0 || walletBalanceRON <= 0}
                className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTopUpSubmitting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDemoBudgetModalOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">Set demo budget</h3>
            <p className="mt-1 text-sm text-slate-500">This resets demo holdings and demo trades.</p>

            <label className="mt-4 block text-sm font-medium text-slate-600">
              Demo cash (EUR)
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
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSetDemoBudget();
                }}
                disabled={isSettingDemoBudget || parsedDemoBudget <= 0}
                className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSettingDemoBudget ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TradeOrderModal
        isOpen={Boolean(selectedHolding)}
        side={tradeSide}
        onSideChange={setTradeSide}
        coinId={selectedHolding?.coinId ?? selectedHolding?.symbol ?? ''}
        symbol={selectedHolding?.symbol ?? ''}
        coinName={selectedHolding?.coinId ?? ''}
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
