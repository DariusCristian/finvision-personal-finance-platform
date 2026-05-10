const FALLBACK_CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  RON: 'RON',
};

export const currencyIndicator = (currency: string | null | undefined): string => {
  const normalized = String(currency ?? '').trim().toUpperCase();
  return FALLBACK_CURRENCY_SYMBOL[normalized] ?? '$';
};

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const trimTrailingZeros = (value: string): string => {
  if (!value.includes('.')) {
    return value;
  }

  return value
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '')
    .replace(/\.$/u, '');
};

export const formatMoney = (value: number | null | undefined, currency = 'USD'): string => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return `${currencyIndicator(currency)}0.00`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
};

export const formatPrice = (value: number | null | undefined, currency = 'USD'): string => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return '--';
  }

  const absolute = Math.abs(numericValue);
  let maxFractionDigits = 2;

  if (absolute < 0.0001) {
    maxFractionDigits = 8;
  } else if (absolute < 0.01) {
    maxFractionDigits = 6;
  } else if (absolute < 1) {
    maxFractionDigits = 4;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFractionDigits,
  }).format(numericValue);
};

export const formatCompactNumber = (value: number | null | undefined): string => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(numericValue);
};

export const formatQty = (
  value: number | null | undefined,
  symbol?: string,
  options: { compactThreshold?: number } = {},
): string => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return '0';
  }

  const absolute = Math.abs(numericValue);
  const compactThreshold = options.compactThreshold ?? 1_000_000;

  if (absolute >= compactThreshold) {
    return formatCompactNumber(value);
  }

  const memeLikeSymbols = new Set(['SHIB', 'PEPE', 'FLOKI', 'BONK', 'DOGE']);
  const uppercaseSymbol = String(symbol || '').toUpperCase();
  const maximumFractionDigits = memeLikeSymbols.has(uppercaseSymbol) ? 2 : 6;

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(numericValue);

  return trimTrailingZeros(formatted);
};

export const formatPct = (value: number | null | undefined, fractionDigits = 2): string => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return 'N/A';
  }

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(numericValue);

  return `${numericValue >= 0 ? '+' : ''}${formatted}%`;
};
