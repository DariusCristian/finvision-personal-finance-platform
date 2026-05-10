import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import { getSimplePrices, isCoinGeckoConfigured } from '../../integrations/coingecko/coingeckoClient.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { InvestFunding } from '../../models/invest-funding.js';
import { InvestingWalletLedger } from '../../models/investing-wallet-ledger.js';
import { PortfolioHolding } from '../../models/portfolio-holding.js';
import { PortfolioTrade } from '../../models/portfolio-trade.js';
import { Transaction } from '../../models/transaction.js';
import { toCSV, setCsvDownloadHeaders } from '../../utils/csv.js';
import { budgetExportQuerySchema, investExportQuerySchema } from '../../validation/exports.js';

const exportsRouter = Router();

const CRYPTO_ACCOUNT_TYPE = 'crypto';
const MAX_BUDGET_EXPORT_RANGE_DAYS = 366 * 2;

const toDateStartUtc = (dateText) => new Date(`${dateText}T00:00:00.000Z`);
const toDateEndUtc = (dateText) => new Date(`${dateText}T23:59:59.999Z`);

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const formatDay = (value) => (isValidDate(value) ? value.toISOString().slice(0, 10) : '');
const formatDateTime = (value) => (isValidDate(value) ? value.toISOString() : '');
const toMoney = (value) => Number(Number(value ?? 0).toFixed(2));
const toDecimal = (value, digits = 8) => Number(Number(value ?? 0).toFixed(digits));
const pad2 = (value) => String(value).padStart(2, '0');

const resolveMonthWindow = ({ range, year, month }) => {
  if (range !== 'month') {
    return null;
  }

  const now = new Date();
  const safeYear = year ?? now.getUTCFullYear();
  const safeMonth = month ?? now.getUTCMonth() + 1;
  const start = new Date(Date.UTC(safeYear, safeMonth - 1, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(safeYear, safeMonth, 1, 0, 0, 0));

  return {
    year: safeYear,
    month: safeMonth,
    start,
    endExclusive,
  };
};

const sendCsv = (res, filename, csv) => {
  setCsvDownloadHeaders(res, filename);
  res.status(200).send(`\uFEFF${csv}`);
};

exportsRouter.get(
  '/budget.csv',
  requireAuth,
  validateRequest({ query: budgetExportQuerySchema }),
  async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const rangeStart = toDateStartUtc(from);
      const rangeEnd = toDateEndUtc(to);

      if (!isValidDate(rangeStart) || !isValidDate(rangeEnd) || rangeEnd < rangeStart) {
        throw new AppError({
          message: 'Invalid export date range.',
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          details: [{ field: 'from/to', message: 'Use a valid range where from <= to.' }],
        });
      }

      const rangeDays = Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;

      if (rangeDays > MAX_BUDGET_EXPORT_RANGE_DAYS) {
        throw new AppError({
          message: 'Budget export range is too large.',
          statusCode: 400,
          code: 'EXPORT_RANGE_TOO_LARGE',
          details: [
            { maxDays: MAX_BUDGET_EXPORT_RANGE_DAYS, message: 'Please export a range under 2 years.' },
          ],
        });
      }

      const transactions = await Transaction.find({
        userId: req.authUser._id,
        date: {
          $gte: rangeStart,
          $lte: rangeEnd,
        },
      })
        .populate('categoryId', 'name')
        .sort({ date: 1, createdAt: 1 });

      const headers = [
        'Date',
        'Type',
        'Category',
        'Amount',
        'Currency',
        'Merchant',
        'Note',
        'PaymentMethod',
        'IsRecurring',
        'RepeatRule',
        'RepeatEndDate',
        'CreatedAt',
      ];

      const rows = transactions.map((transaction) => ({
        Date: formatDay(transaction.date),
        Type: transaction.type ?? '',
        Category: transaction.categoryId?.name ?? '',
        Amount: toMoney(transaction.amount),
        Currency: transaction.currency ?? req.authUser.baseCurrency ?? '',
        Merchant: '',
        Note: transaction.description ?? '',
        PaymentMethod: transaction.paymentMethod ?? '',
        IsRecurring: transaction.isRecurring ? 'yes' : 'no',
        RepeatRule: transaction.recurrence ?? 'none',
        RepeatEndDate: formatDay(transaction.recurrenceEndDate),
        CreatedAt: formatDateTime(transaction.createdAt),
      }));

      const filename = `finvision-budget-${from}_to_${to}.csv`;
      const csv = toCSV({ headers, rows });
      sendCsv(res, filename, csv);
    } catch (error) {
      next(error);
    }
  },
);

exportsRouter.get(
  '/invest.csv',
  requireAuth,
  validateRequest({ query: investExportQuerySchema }),
  async (req, res, next) => {
    try {
      const { range = 'month' } = req.query;
      const monthWindow = resolveMonthWindow({
        range,
        year: req.query.year,
        month: req.query.month,
      });

      const createdAtFilter =
        monthWindow
          ? {
            createdAt: {
              $gte: monthWindow.start,
              $lt: monthWindow.endExclusive,
            },
          }
          : {};

      const [trades, holdings, ledgerEntries, fundingEntries] = await Promise.all([
        PortfolioTrade.find({
          userId: req.authUser._id,
          accountType: CRYPTO_ACCOUNT_TYPE,
          assetType: 'crypto',
          ...createdAtFilter,
        }).sort({ createdAt: 1 }),
        PortfolioHolding.find({
          userId: req.authUser._id,
          accountType: CRYPTO_ACCOUNT_TYPE,
          assetType: 'crypto',
        }).sort({ symbol: 1 }),
        InvestingWalletLedger.find({
          userId: req.authUser._id,
          type: {
            $in: ['deposit', 'autofund', 'fx_convert_to_eur'],
          },
          ...createdAtFilter,
        }).sort({ createdAt: 1 }),
        InvestFunding.find({
          userId: req.authUser._id,
          ...createdAtFilter,
        }).sort({ createdAt: 1 }),
      ]);

      const exportGeneratedAt = new Date();
      const coinIds = holdings.map((holding) => holding.coinId).filter(Boolean);
      let pricesMap = {};

      if (coinIds.length > 0 && isCoinGeckoConfigured()) {
        try {
          pricesMap = await getSimplePrices(coinIds, 'eur');
        } catch {
          pricesMap = {};
        }
      }

      const headers = [
        'RecordType',
        'ExecutedAt',
        'SnapshotAt',
        'CreatedAt',
        'Side',
        'AssetType',
        'CoinId',
        'Symbol',
        'Quantity',
        'PriceEUR',
        'TotalEUR',
        'FeesEUR',
        'AvgCostEUR',
        'MarketPriceEUR',
        'MarketValueEUR',
        'Type',
        'AmountRON',
        'Rate',
        'EurAmount',
        'Note',
      ];

      const rowsWithSort = [];

      trades.forEach((trade) => {
        rowsWithSort.push({
          _sortAt: trade.createdAt?.getTime?.() ?? 0,
          RecordType: 'TRADE',
          ExecutedAt: formatDateTime(trade.createdAt),
          SnapshotAt: '',
          CreatedAt: '',
          Side: trade.side ?? '',
          AssetType: trade.assetType ?? '',
          CoinId: trade.coinId ?? '',
          Symbol: trade.symbol ?? '',
          Quantity: toDecimal(trade.quantity),
          PriceEUR: toMoney(trade.price),
          TotalEUR: toMoney(trade.total),
          FeesEUR: '',
          AvgCostEUR: '',
          MarketPriceEUR: '',
          MarketValueEUR: '',
          Type: '',
          AmountRON: '',
          Rate: '',
          EurAmount: '',
          Note: '',
        });
      });

      holdings.forEach((holding) => {
        const quote = holding.coinId ? pricesMap[holding.coinId] : null;
        const marketPriceEUR = typeof quote?.price === 'number' ? quote.price : 0;
        const marketValueEUR = holding.quantity * marketPriceEUR;

        rowsWithSort.push({
          _sortAt: exportGeneratedAt.getTime(),
          RecordType: 'HOLDING_SNAPSHOT',
          ExecutedAt: '',
          SnapshotAt: formatDateTime(exportGeneratedAt),
          CreatedAt: '',
          Side: '',
          AssetType: holding.assetType ?? 'crypto',
          CoinId: holding.coinId ?? '',
          Symbol: holding.symbol ?? '',
          Quantity: toDecimal(holding.quantity),
          PriceEUR: '',
          TotalEUR: '',
          FeesEUR: '',
          AvgCostEUR: toMoney(holding.avgCost),
          MarketPriceEUR: toMoney(marketPriceEUR),
          MarketValueEUR: toMoney(marketValueEUR),
          Type: '',
          AmountRON: '',
          Rate: '',
          EurAmount: '',
          Note: '',
        });
      });

      ledgerEntries.forEach((entry) => {
        const isFxConvert = entry.type === 'fx_convert_to_eur';
        const note = typeof entry.meta?.note === 'string' ? entry.meta.note : '';
        const rate = isFxConvert ? (entry.meta?.rateEurPerRon ?? '') : '';
        const eurAmount = isFxConvert ? (entry.meta?.eurAmount ?? '') : '';

        rowsWithSort.push({
          _sortAt: entry.createdAt?.getTime?.() ?? 0,
          RecordType: isFxConvert ? 'FX_CONVERT' : 'FUNDING',
          ExecutedAt: '',
          SnapshotAt: '',
          CreatedAt: formatDateTime(entry.createdAt),
          Side: '',
          AssetType: '',
          CoinId: '',
          Symbol: '',
          Quantity: '',
          PriceEUR: '',
          TotalEUR: '',
          FeesEUR: '',
          AvgCostEUR: '',
          MarketPriceEUR: '',
          MarketValueEUR: '',
          Type: entry.type ?? '',
          AmountRON: toMoney(isFxConvert ? Math.abs(entry.amountRON) : entry.amountRON),
          Rate: rate === '' ? '' : toDecimal(rate, 10),
          EurAmount: eurAmount === '' ? '' : toMoney(eurAmount),
          Note: note,
        });
      });

      fundingEntries.forEach((funding) => {
        rowsWithSort.push({
          _sortAt: funding.createdAt?.getTime?.() ?? 0,
          RecordType: 'FUNDING',
          ExecutedAt: '',
          SnapshotAt: '',
          CreatedAt: formatDateTime(funding.createdAt),
          Side: '',
          AssetType: '',
          CoinId: '',
          Symbol: '',
          Quantity: '',
          PriceEUR: '',
          TotalEUR: '',
          FeesEUR: '',
          AvgCostEUR: '',
          MarketPriceEUR: '',
          MarketValueEUR: '',
          Type: 'topup',
          AmountRON: toMoney(funding.fromAmount),
          Rate: toDecimal(funding.rate, 10),
          EurAmount: toMoney(funding.toAmount),
          Note: 'Direct invest top-up',
        });
      });

      rowsWithSort.sort((left, right) => left._sortAt - right._sortAt);

      const rows = rowsWithSort.map(({ _sortAt: _ignored, ...row }) => row);

      const filename =
        range === 'month' && monthWindow
          ? `finvision-invest-crypto-${monthWindow.year}-${pad2(monthWindow.month)}.csv`
          : 'finvision-invest-crypto-all.csv';

      const csv = toCSV({ headers, rows });
      sendCsv(res, filename, csv);
    } catch (error) {
      next(error);
    }
  },
);

export { exportsRouter };

