import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_BODY_SNIPPET_LENGTH = 220;

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const PRICE_CACHE_TTL_MS = 45 * 1000;
const CHART_CACHE_TTL_MS = 10 * 60 * 1000;

const cacheStore = new Map();
const inFlightStore = new Map();

export class CoinGeckoProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CoinGeckoProviderError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'COINGECKO_PROVIDER_ERROR';
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

export const isCoinGeckoConfigured = () =>
  typeof env.COINGECKO_API_KEY === 'string' && env.COINGECKO_API_KEY.trim().length > 0;

const createProviderNotConfiguredError = () =>
  new CoinGeckoProviderError('Missing COINGECKO_API_KEY', {
    status: 501,
    code: 'COINGECKO_NOT_CONFIGURED',
    details: [{ reason: 'MISSING_COINGECKO_API_KEY' }],
  });

const fetchCoinGecko = async ({ path, query = {} }) => {
  if (!isCoinGeckoConfigured()) {
    throw createProviderNotConfiguredError();
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const endpointUrl = `${COINGECKO_API_BASE_URL}${path}${params.toString() ? `?${params.toString()}` : ''}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(endpointUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'x-cg-demo-api-key': env.COINGECKO_API_KEY,
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

    throw new CoinGeckoProviderError(
      isTimeout ? 'CoinGecko request timed out.' : 'Could not connect to CoinGecko.',
      {
        status: 502,
        code: 'COINGECKO_PROVIDER_ERROR',
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
    logger.warn('coingecko.request.failed', {
      path,
      status: response.status,
      bodySnippet: toBodySnippet(bodyText),
    });

    throw new CoinGeckoProviderError('CoinGecko provider unavailable.', {
      status: response.status === 429 ? 429 : 502,
      code: response.status === 429 ? 'RATE_LIMITED' : 'COINGECKO_PROVIDER_ERROR',
      details: [{ reason: 'NON_200_RESPONSE', status: response.status }],
    });
  }

  if (!bodyText.trim().startsWith('{')) {
    throw new CoinGeckoProviderError('CoinGecko returned a non-JSON response.', {
      status: 502,
      code: 'COINGECKO_PROVIDER_ERROR',
      details: [{ reason: 'NON_JSON_RESPONSE', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  let payload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new CoinGeckoProviderError('CoinGecko returned invalid JSON.', {
      status: 502,
      code: 'COINGECKO_PROVIDER_ERROR',
      details: [{ reason: 'INVALID_JSON', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  if (payload?.error) {
    throw new CoinGeckoProviderError('CoinGecko responded with an error.', {
      status: 502,
      code: 'COINGECKO_PROVIDER_ERROR',
      details: [{ reason: 'PROVIDER_ERROR', providerError: payload.error }],
    });
  }

  return payload;
};

const normalizeCoinIdList = (coinIds) => {
  if (!Array.isArray(coinIds)) {
    return [];
  }

  return [...new Set(coinIds.map((coinId) => String(coinId).trim().toLowerCase()).filter(Boolean))];
};

export const searchCoins = async (query) => {
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';

  if (!normalizedQuery) {
    return [];
  }

  const cacheKey = `coingecko:search:${normalizedQuery}`;

  return withCachedRequest(cacheKey, SEARCH_CACHE_TTL_MS, async () => {
    const payload = await fetchCoinGecko({
      path: '/search',
      query: {
        query: normalizedQuery,
      },
    });

    const coins = Array.isArray(payload?.coins) ? payload.coins : [];

    return coins.slice(0, 20).map((coin) => ({
      coinId: String(coin.id ?? '').trim(),
      symbol: String(coin.symbol ?? '').trim().toUpperCase(),
      name: String(coin.name ?? '').trim(),
      thumb: String(coin.thumb ?? '').trim(),
    })).filter((coin) => coin.coinId && coin.symbol && coin.name);
  });
};

export const getSimplePrices = async (coinIds, vsCurrency) => {
  const normalizedCoinIds = normalizeCoinIdList(coinIds);

  if (normalizedCoinIds.length === 0) {
    return {};
  }

  const normalizedVs = String(vsCurrency || 'usd').trim().toLowerCase();
  const cacheKey = `coingecko:price:${normalizedVs}:${normalizedCoinIds.join(',')}`;

  return withCachedRequest(cacheKey, PRICE_CACHE_TTL_MS, async () => {
    const payload = await fetchCoinGecko({
      path: '/simple/price',
      query: {
        ids: normalizedCoinIds.join(','),
        vs_currencies: normalizedVs,
        include_24hr_change: 'true',
      },
    });

    return normalizedCoinIds.reduce((accumulator, coinId) => {
      const coinData = payload?.[coinId];
      const priceValue = Number(coinData?.[normalizedVs]);
      const changeValue = Number(coinData?.[`${normalizedVs}_24h_change`]);

      if (Number.isFinite(priceValue)) {
        accumulator[coinId] = {
          price: priceValue,
          change24h: Number.isFinite(changeValue) ? changeValue : null,
        };
      }

      return accumulator;
    }, {});
  });
};

export const getMarketChart = async (coinId, vsCurrency, days = 7) => {
  const normalizedCoinId = String(coinId || '').trim().toLowerCase();

  if (!normalizedCoinId) {
    return [];
  }

  const normalizedVs = String(vsCurrency || 'usd').trim().toLowerCase();
  const safeDays = Math.max(1, Math.min(365, Number(days) || 7));
  const cacheKey = `coingecko:chart:${normalizedCoinId}:${normalizedVs}:${safeDays}`;

  return withCachedRequest(cacheKey, CHART_CACHE_TTL_MS, async () => {
    const payload = await fetchCoinGecko({
      path: `/coins/${encodeURIComponent(normalizedCoinId)}/market_chart`,
      query: {
        vs_currency: normalizedVs,
        days: safeDays,
      },
    });

    const prices = Array.isArray(payload?.prices) ? payload.prices : [];

    return prices
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => ({
        t: Number(point[0]),
        price: Number(point[1]),
      }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price));
  });
};
