const DEFAULT_CURRENCY = 'RON';

const toFiniteAmount = (amount: number | null | undefined): number =>
  typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

const getSafeCurrency = (currency: string | undefined): string =>
  typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : DEFAULT_CURRENCY;

const formatWithOptions = (
  amount: number,
  currency: string,
  options: Intl.NumberFormatOptions,
): string => {
  const safeCurrency = getSafeCurrency(currency);

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: safeCurrency,
      ...options,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
      ...options,
    }).format(amount);
  }
};

export const formatMoney = (amount: number | null | undefined, currency: string): string =>
  formatWithOptions(toFiniteAmount(amount), currency, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatMoneyCompact = (amount: number | null | undefined, currency: string): string =>
  formatWithOptions(toFiniteAmount(amount), currency, {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
