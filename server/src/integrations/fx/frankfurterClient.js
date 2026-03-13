import { logger } from '../../utils/logger.js';

const FRANKFURTER_API_BASE_URL = 'https://api.frankfurter.dev/v1';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BODY_SNIPPET_LENGTH = 220;
const LATEST_RATES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CONVERT_CACHE_TTL_MS = 60 * 1000;

const cacheStore = new Map();
const inFlightStore = new Map();

export class FxProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'FxProviderError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'FX_PROVIDER_ERROR';
    this.details = options.details ?? [];
  }
}

const isCacheHit = (cacheItem) => cacheItem && cacheItem.expiresAt > Date.now();

const getCache = (cacheKey) => {
  const cacheItem = cacheStore.get(cacheKey);

  if (isCacheHit(cacheItem)) {
    return cacheItem.value;
  }

  if (cacheItem) {
    cacheStore.delete(cacheKey);
  }

  return null;
};

const setCache = (cacheKey, value, ttlMs) => {
  cacheStore.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};

const withCachedRequest = async (cacheKey, ttlMs, resolver) => {
  const cachedValue = getCache(cacheKey);

  if (cachedValue !== null) {
    return cachedValue;
  }

  if (inFlightStore.has(cacheKey)) {
    return inFlightStore.get(cacheKey);
  }

  const requestPromise = resolver()
    .then((result) => {
      setCache(cacheKey, result, ttlMs);
      return result;
    })
    .finally(() => {
      inFlightStore.delete(cacheKey);
    });

  inFlightStore.set(cacheKey, requestPromise);
  return requestPromise;
};

const toBodySnippet = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_BODY_SNIPPET_LENGTH);
};

const fetchFrankfurter = async ({ path, query }) => {
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const endpointUrl = `${FRANKFURTER_API_BASE_URL}${path}${params.toString() ? `?${params.toString()}` : ''}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(endpointUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

    throw new FxProviderError(
      isTimeout ? 'FX provider request timed out.' : 'Could not connect to FX provider.',
      {
        status: 502,
        code: 'FX_PROVIDER_ERROR',
        details: [
          {
            reason: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Unknown provider error',
          },
        ],
      },
    );
  }

  clearTimeout(timeoutId);

  const bodyText = await response.text();

  if (!response.ok) {
    logger.warn('fx.frankfurter.request.failed', {
      status: response.status,
      path,
      bodySnippet: toBodySnippet(bodyText),
    });

    throw new FxProviderError('FX provider unavailable.', {
      status: response.status === 429 ? 429 : 502,
      code: response.status === 429 ? 'RATE_LIMITED' : 'FX_PROVIDER_ERROR',
      details: [{ reason: 'NON_200_RESPONSE', status: response.status }],
    });
  }

  if (!bodyText.trim().startsWith('{')) {
    throw new FxProviderError('FX provider returned a non-JSON response.', {
      status: 502,
      code: 'FX_PROVIDER_ERROR',
      details: [{ reason: 'NON_JSON_RESPONSE', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  let payload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new FxProviderError('FX provider returned invalid JSON.', {
      status: 502,
      code: 'FX_PROVIDER_ERROR',
      details: [{ reason: 'INVALID_JSON', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  if (payload?.error) {
    throw new FxProviderError('FX provider responded with an error.', {
      status: 502,
      code: 'FX_PROVIDER_ERROR',
      details: [{ reason: 'PROVIDER_ERROR', providerError: payload.error }],
    });
  }

  return payload;
};

export const getLatestRates = async (base = 'EUR', symbols = ['USD', 'RON']) => {
  const normalizedBase = String(base || 'EUR').trim().toUpperCase();
  const normalizedSymbols = symbols
    .map((symbol) => String(symbol || '').trim().toUpperCase())
    .filter(Boolean);
  const cacheKey = `fx:latest:${normalizedBase}:${normalizedSymbols.join(',')}`;

  return withCachedRequest(cacheKey, LATEST_RATES_CACHE_TTL_MS, async () => {
    const payload = await fetchFrankfurter({
      path: '/latest',
      query: {
        base: normalizedBase,
        symbols: normalizedSymbols.join(','),
      },
    });

    const rateMap = typeof payload?.rates === 'object' && payload?.rates !== null ? payload.rates : {};

    return {
      base: String(payload?.base || normalizedBase).trim().toUpperCase(),
      date: String(payload?.date || ''),
      rates: Object.entries(rateMap).reduce((accumulator, [symbol, value]) => {
        const numericValue = Number(value);

        if (Number.isFinite(numericValue)) {
          accumulator[String(symbol).toUpperCase()] = numericValue;
        }

        return accumulator;
      }, {}),
    };
  });
};

export const convert = async ({ from, to, amount }) => {
  const normalizedFrom = String(from || '').trim().toUpperCase();
  const normalizedTo = String(to || '').trim().toUpperCase();
  const numericAmount = Number(amount);

  if (!normalizedFrom || !normalizedTo || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new FxProviderError('Invalid conversion input.', {
      status: 400,
      code: 'FX_INVALID_INPUT',
      details: [{ reason: 'INVALID_CONVERSION_PAYLOAD' }],
    });
  }

  const cacheKey = `fx:convert:${normalizedFrom}:${normalizedTo}:${numericAmount}`;

  return withCachedRequest(cacheKey, CONVERT_CACHE_TTL_MS, async () => {
    const payload = await fetchFrankfurter({
      path: '/latest',
      query: {
        from: normalizedFrom,
        to: normalizedTo,
        amount: numericAmount,
      },
    });

    const rates = payload?.rates || {};
    const resultValue = Number(rates?.[normalizedTo]);

    if (!Number.isFinite(resultValue)) {
      throw new FxProviderError('FX conversion result is unavailable.', {
        status: 502,
        code: 'FX_PROVIDER_ERROR',
        details: [{ reason: 'MISSING_RATE', from: normalizedFrom, to: normalizedTo }],
      });
    }

    return {
      from: normalizedFrom,
      to: normalizedTo,
      amount: numericAmount,
      rate: resultValue / numericAmount,
      result: resultValue,
      date: String(payload?.date || ''),
      provider: 'frankfurter',
    };
  });
};
