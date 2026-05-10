import { PortfolioAccount } from '../../models/portfolio-account.js';
import { PortfolioHolding } from '../../models/portfolio-holding.js';
import { Transaction } from '../../models/transaction.js';
import { getSimplePrices, isCoinGeckoConfigured } from '../../integrations/coingecko/coingeckoClient.js';

const toMoney = (value) => Number(Number(value).toFixed(2));
const toQuantity = (value) => Number(Number(value).toFixed(8));
const normalizeCoinId = (value) => String(value || '').trim().toLowerCase();

const serializeTransaction = (transaction) => ({
  id: transaction._id.toString(),
  type: transaction.type,
  amount: Number(transaction.amount),
  currency: transaction.currency ?? 'RON',
  date: transaction.date?.toISOString?.() ?? null,
  description: transaction.description ?? '',
  isRecurring: Boolean(transaction.isRecurring),
  recurrence: transaction.recurrence ?? 'none',
  recurrenceEndDate: transaction.recurrenceEndDate?.toISOString?.() ?? null,
});

const resolveMode = (value) => (value === 'demo' || value === 'funded' ? value : 'funded');

const getMonthBoundsUtc = (monthKey) => {
  const normalizedMonthKey =
    typeof monthKey === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)
      ? monthKey
      : new Date().toISOString().slice(0, 7);
  const [year, month] = normalizedMonthKey.split('-').map(Number);

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return {
    monthKey: normalizedMonthKey,
    monthStart,
    monthEnd,
  };
};

const getMonthPaceData = ({ monthStart, monthEnd }) => {
  const now = new Date();
  const isCurrentMonth =
    monthStart.getUTCFullYear() === now.getUTCFullYear()
    && monthStart.getUTCMonth() === now.getUTCMonth();

  const lastDayInMonth = new Date(monthEnd.getTime() - 1);
  const effectiveDate = isCurrentMonth && now < monthEnd ? now : lastDayInMonth;

  const daysInMonth = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000)));
  const daysPassed = Math.min(
    daysInMonth,
    Math.max(1, Math.floor((effectiveDate.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000)) + 1),
  );

  return {
    effectiveDate,
    daysInMonth,
    daysPassed,
  };
};

const fetchCryptoPricesMap = async (coinIds) => {
  const uniqueCoinIds = [...new Set(
    (Array.isArray(coinIds) ? coinIds : [])
      .map((coinId) => normalizeCoinId(coinId))
      .filter(Boolean),
  )];

  if (uniqueCoinIds.length === 0 || !isCoinGeckoConfigured()) {
    return {};
  }

  try {
    return await getSimplePrices(uniqueCoinIds, 'eur');
  } catch {
    return {};
  }
};

const buildHoldingsAllocations = (holdings, accountType, cryptoPricesMap = {}) => {
  const relevantHoldings = holdings.filter((holding) => holding.accountType === accountType);

  if (relevantHoldings.length === 0) {
    return [];
  }

  const enriched = relevantHoldings.map((holding) => {
    const quantity = Number(holding.quantity || 0);
    const avgCost = Number(holding.avgCost || 0);
    const coinId = accountType === 'crypto' ? normalizeCoinId(holding.coinId) : '';
    const quote = coinId ? cryptoPricesMap[coinId] ?? null : null;
    const livePrice = Number(quote?.price);
    const price = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : avgCost;
    const marketValue = quantity * (Number.isFinite(price) ? price : 0);

    return {
      symbol: holding.symbol,
      coinId: holding.coinId ?? null,
      mode: holding.mode,
      accountType: holding.accountType,
      assetType: holding.assetType,
      quantity: toQuantity(quantity),
      referencePrice: toMoney(price),
      priceSource:
        accountType === 'crypto'
          ? (Number.isFinite(livePrice) && livePrice > 0 ? 'live_quote' : 'avg_cost_estimate')
          : 'avg_cost_estimate',
      change24h:
        accountType === 'crypto' && Number.isFinite(Number(quote?.change24h))
          ? Number(Number(quote.change24h).toFixed(4))
          : null,
      marketValue: toMoney(marketValue),
      allocationPct: 0,
    };
  });

  const totalValue = enriched.reduce((sum, holding) => sum + Number(holding.marketValue || 0), 0);

  return enriched.map((holding) => ({
    ...holding,
    allocationPct: totalValue > 0 ? Number(((holding.marketValue / totalValue) * 100).toFixed(2)) : 0,
  }));
};

export const buildInsightContext = async ({ authUser, selectedMonth }) => {
  const cryptoMode = resolveMode(authUser.investCryptoMode);
  const stocksMode = resolveMode(authUser.marketStocksMode);
  const { monthKey, monthStart, monthEnd } = getMonthBoundsUtc(selectedMonth);

  const [monthTransactions, recurringTransactions, recentTransactions, accounts, holdings] = await Promise.all([
    Transaction.find({
      userId: authUser._id,
      date: {
        $gte: monthStart,
        $lt: monthEnd,
      },
    }).select('type amount currency date description isRecurring recurrence recurrenceEndDate'),
    Transaction.find({
      userId: authUser._id,
      type: 'expense',
      isRecurring: true,
    })
      .sort({ date: -1 })
      .limit(50)
      .select('type amount currency date description isRecurring recurrence recurrenceEndDate'),
    Transaction.find({
      userId: authUser._id,
    })
      .sort({ date: -1 })
      .limit(10)
      .select('type amount currency date description isRecurring recurrence recurrenceEndDate'),
    PortfolioAccount.find({
      userId: authUser._id,
      $or: [
        { accountType: 'crypto', mode: cryptoMode },
        { accountType: 'stocks', mode: stocksMode },
      ],
    }).select('accountType mode cashBalance baseCurrency'),
    PortfolioHolding.find({
      userId: authUser._id,
      $or: [
        { accountType: 'crypto', mode: cryptoMode },
        { accountType: 'stocks', mode: stocksMode },
      ],
    }).select('coinId symbol quantity avgCost accountType mode assetType'),
  ]);

  const { effectiveDate, daysInMonth, daysPassed } = getMonthPaceData({ monthStart, monthEnd });
  const cryptoCoinIds = holdings
    .filter((holding) => holding.accountType === 'crypto' && holding.assetType === 'crypto')
    .map((holding) => holding.coinId);
  const cryptoPricesMap = await fetchCryptoPricesMap(cryptoCoinIds);

  const totals = monthTransactions.reduce(
    (accumulator, transaction) => {
      const amount = Math.abs(Number(transaction.amount || 0));

      if (!Number.isFinite(amount) || amount <= 0) {
        return accumulator;
      }

      const transactionDate = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
      const isToDate = transactionDate <= effectiveDate;

      if (transaction.type === 'income') {
        accumulator.incomeTotal += amount;
        if (isToDate) {
          accumulator.incomeToDate += amount;
        }
      }

      if (transaction.type === 'expense') {
        accumulator.expenseTotal += amount;
        if (isToDate) {
          accumulator.expenseToDate += amount;
        }
      }

      return accumulator;
    },
    {
      incomeTotal: 0,
      expenseTotal: 0,
      incomeToDate: 0,
      expenseToDate: 0,
    },
  );

  const budgetGoalRaw = Number(authUser.monthlyBudgetGoal);
  const budgetGoal = Number.isFinite(budgetGoalRaw) && budgetGoalRaw > 0 ? budgetGoalRaw : 0;

  const cryptoAccount = accounts.find(
    (account) => account.accountType === 'crypto' && account.mode === cryptoMode,
  );
  const stocksAccount = accounts.find(
    (account) => account.accountType === 'stocks' && account.mode === stocksMode,
  );

  const cryptoHoldingsAllocations = buildHoldingsAllocations(holdings, 'crypto', cryptoPricesMap);
  const stocksHoldingsAllocations = buildHoldingsAllocations(holdings, 'stocks', cryptoPricesMap);
  const cryptoQuotes = cryptoHoldingsAllocations.map((holding) => ({
    coinId: normalizeCoinId(holding.coinId),
    symbol: holding.symbol,
    priceEUR: holding.referencePrice,
    change24h: holding.change24h,
    priceSource: holding.priceSource,
  }));

  return {
    profile: {
      locale: authUser.locale ?? 'en-US',
      baseCurrency: authUser.baseCurrency ?? 'RON',
      monthlyBudgetGoal: budgetGoal > 0 ? toMoney(budgetGoal) : 0,
      investCryptoMode: cryptoMode,
      marketStocksMode: stocksMode,
    },
    budget: {
      monthKey,
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
      daysInMonth,
      daysPassed,
      budgetGoal: toMoney(budgetGoal),
      incomeTotal: toMoney(totals.incomeTotal),
      expenseTotal: toMoney(totals.expenseTotal),
      incomeToDate: toMoney(totals.incomeToDate),
      expenseToDate: toMoney(totals.expenseToDate),
      remainingBudget: toMoney(Math.max(0, budgetGoal - totals.expenseTotal)),
    },
    recentTransactions: recentTransactions.map((transaction) => serializeTransaction(transaction)),
    recurringTransactions: recurringTransactions.map((transaction) => serializeTransaction(transaction)),
    investing: {
      crypto: {
        selectedMode: cryptoMode,
        buyingPower: toMoney(Number(cryptoAccount?.cashBalance || 0)),
      },
      stocks: {
        selectedMode: stocksMode,
        buyingPower: toMoney(Number(stocksAccount?.cashBalance || 0)),
      },
    },
    holdingsAllocations: [...cryptoHoldingsAllocations, ...stocksHoldingsAllocations],
    marketData: {
      cryptoQuotes,
    },
  };
};
