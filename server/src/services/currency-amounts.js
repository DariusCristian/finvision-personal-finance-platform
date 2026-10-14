import { AppError } from '../errors/app-error.js';
import { FxProviderError, getRatesForDate } from '../integrations/fx/frankfurterClient.js';

// Transactions store their amount in every supported currency, converted with the rates of the transaction's date
// (AUDIT.md finding 5). Totals read the user's current base currency, so changing it needs no recomputation.

export const SUPPORTED_CURRENCIES = ['RON', 'EUR', 'USD'];

const toMoney = (value) => Number(Number(value).toFixed(2));
const toRate = (value) => Number(Number(value).toFixed(10));
const toIsoDay = (date) => new Date(date).toISOString().slice(0, 10);

const fetchRates = async (request) => {
  try {
    return await getRatesForDate(request);
  } catch (error) {
    if (error instanceof FxProviderError) {
      throw new AppError({
        message:
          'Exchange rates are unavailable right now, so the amount could not be converted. Please try again.',
        statusCode: error.status === 429 ? 429 : 502,
        code: error.code,
        details: error.details,
      });
    }

    throw error;
  }
};

// The latest rate from EUR (the investing accounts' currency) to `currency`.
export const getEurRateTo = async (currency) => {
  if (currency === 'EUR') {
    return 1;
  }

  const { rates } = await fetchRates({
    base: 'EUR',
    symbols: [currency],
    date: toIsoDay(new Date()),
  });
  return rates[currency];
};

// Fetches the rates first (no DB access), so callers can run it before any write. Throws FxProviderError (502)
// when a rate is unavailable, rather than storing a wrong amount.
export const buildCurrencyConversion = async ({ amount, currency, date }) => {
  const otherCurrencies = SUPPORTED_CURRENCIES.filter((code) => code !== currency);
  const { date: rateDate, rates } = await fetchRates({
    base: currency,
    symbols: otherCurrencies,
    date: toIsoDay(date),
  });
  const fxRates = { [currency]: 1, ...rates };

  return {
    convertedAmounts: Object.fromEntries(
      SUPPORTED_CURRENCIES.map((code) => [code, toMoney(amount * fxRates[code])]),
    ),
    fxRates: Object.fromEntries(SUPPORTED_CURRENCIES.map((code) => [code, toRate(fxRates[code])])),
    fxRateDate: rateDate,
    fxProvider: 'frankfurter',
  };
};

// Re-applies a conversion's rates to another amount in the same currency (e.g. when the final amount is only known
// inside a transaction, after the rates were fetched).
export const withConvertedAmount = (conversion, amount) => ({
  ...conversion,
  convertedAmounts: Object.fromEntries(
    SUPPORTED_CURRENCIES.map((code) => [code, toMoney(amount * conversion.fxRates[code])]),
  ),
});

export const hasCurrencyConversion = (transaction) =>
  SUPPORTED_CURRENCIES.every((code) => Number.isFinite(transaction?.convertedAmounts?.[code]));

// The transaction's amount in `targetCurrency`. Transactions created before conversions were stored fall back to
// the raw amount (the previous behaviour) until the backfill script has filled them in.
export const amountInCurrency = (transaction, targetCurrency) => {
  const converted = transaction?.convertedAmounts?.[targetCurrency];

  return Number.isFinite(converted) ? converted : Number(transaction?.amount || 0);
};
