import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const FINNHUB_API_BASE_URL = 'https://finnhub.io/api/v1';
const REQUEST_TIMEOUT_MS = 9000;
const MAX_BODY_SNIPPET_LENGTH = 220;

const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const QUOTE_CACHE_TTL_MS = 45 * 1000;
const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CANDLES_CACHE_TTL_MS = 10 * 60 * 1000;

const cacheStore = new Map();
const inFlightStore = new Map();

export class FinnhubProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'FinnhubProviderError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'FINNHUB_PROVIDER_ERROR';
    this.details = options.details ?? [];
  }
}

const toBodySnippet = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_BODY_SNIPPET_LENGTH);
};

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

export const isFinnhubConfigured = () =>
  typeof env.FINNHUB_API_KEY === 'string' && env.FINNHUB_API_KEY.trim().length > 0;

const createProviderNotConfiguredError = () =>
  new FinnhubProviderError('Missing FINNHUB_API_KEY', {
    status: 501,
    code: 'FINNHUB_NOT_CONFIGURED',
    details: [{ reason: 'MISSING_FINNHUB_API_KEY' }],
  });

const buildFinnhubUrls = ({ path, query = {} }) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  params.set('token', env.FINNHUB_API_KEY);

  const endpointUrl = `${FINNHUB_API_BASE_URL}${path}?${params.toString()}`;
  const redactedUrl = endpointUrl.replace(env.FINNHUB_API_KEY, '[REDACTED]');

  return {
    endpointUrl,
    redactedUrl,
  };
};

const fetchFinnhub = async ({ path, query = {} }) => {
  if (!isFinnhubConfigured()) {
    throw createProviderNotConfiguredError();
  }

  const { endpointUrl, redactedUrl } = buildFinnhubUrls({ path, query });

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

    throw new FinnhubProviderError(
      isTimeout ? 'Finnhub request timed out.' : 'Could not connect to Finnhub.',
      {
        status: 502,
        code: 'FINNHUB_PROVIDER_ERROR',
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
    logger.warn('finnhub.request.failed', {
      path,
      status: response.status,
      requestUrl: redactedUrl,
      bodySnippet: toBodySnippet(bodyText),
    });

    throw new FinnhubProviderError(
      response.status === 429 ? 'Finnhub rate limit reached.' : 'Finnhub provider unavailable.',
      {
        status: response.status === 429 ? 429 : 502,
        code: response.status === 429 ? 'RATE_LIMITED' : 'FINNHUB_PROVIDER_ERROR',
        details: [{ reason: 'NON_200_RESPONSE', status: response.status }],
      },
    );
  }

  if (!bodyText.trim().startsWith('{') && !bodyText.trim().startsWith('[')) {
    throw new FinnhubProviderError('Finnhub returned a non-JSON response.', {
      status: 502,
      code: 'FINNHUB_PROVIDER_ERROR',
      details: [{ reason: 'NON_JSON_RESPONSE', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  let payload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new FinnhubProviderError('Finnhub returned invalid JSON.', {
      status: 502,
      code: 'FINNHUB_PROVIDER_ERROR',
      details: [{ reason: 'INVALID_JSON', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  if (payload?.error) {
    const providerMessage = String(payload.error || '').toLowerCase();
    const isRateLimited = providerMessage.includes('limit') || providerMessage.includes('429');

    throw new FinnhubProviderError(
      isRateLimited ? 'Finnhub rate limit reached.' : 'Finnhub responded with an error.',
      {
        status: isRateLimited ? 429 : 502,
        code: isRateLimited ? 'RATE_LIMITED' : 'FINNHUB_PROVIDER_ERROR',
        details: [{ reason: 'PROVIDER_ERROR', providerError: payload.error }],
      },
    );
  }

  return payload;
};

const normalizeSymbol = (symbol) => String(symbol || '').trim().toUpperCase();

export const searchSymbol = async (query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const cacheKey = `finnhub:search:${normalizedQuery}`;

  return withCachedRequest(cacheKey, SEARCH_CACHE_TTL_MS, async () => {
    const payload = await fetchFinnhub({
      path: '/search',
      query: {
        q: normalizedQuery,
      },
    });

    const results = Array.isArray(payload?.result) ? payload.result : [];

    return results
      .slice(0, 20)
      .map((item) => ({
        symbol: normalizeSymbol(item?.symbol),
        description: String(item?.description || '').trim(),
        type: String(item?.type || '').trim().toLowerCase(),
      }))
      .filter((item) => item.symbol.length > 0);
  });
};

export const getQuote = async (symbol) => {
  const normalizedSymbol = normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    throw new FinnhubProviderError('Symbol is required.', {
      status: 400,
      code: 'INVALID_SYMBOL',
    });
  }

  const cacheKey = `finnhub:quote:${normalizedSymbol}`;

  return withCachedRequest(cacheKey, QUOTE_CACHE_TTL_MS, async () => {
    const payload = await fetchFinnhub({
      path: '/quote',
      query: {
        symbol: normalizedSymbol,
      },
    });

    const toNumberOrNull = (value) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : null;
    };

    return {
      symbol: normalizedSymbol,
      price: toNumberOrNull(payload?.c),
      change: toNumberOrNull(payload?.d),
      changePct: toNumberOrNull(payload?.dp),
      high: toNumberOrNull(payload?.h),
      low: toNumberOrNull(payload?.l),
      open: toNumberOrNull(payload?.o),
      prevClose: toNumberOrNull(payload?.pc),
      volume: toNumberOrNull(payload?.v),
      timestamp: toNumberOrNull(payload?.t),
    };
  });
};

export const getCompanyProfile = async (symbol) => {
  const normalizedSymbol = normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    throw new FinnhubProviderError('Symbol is required.', {
      status: 400,
      code: 'INVALID_SYMBOL',
    });
  }

  const cacheKey = `finnhub:profile:${normalizedSymbol}`;

  return withCachedRequest(cacheKey, PROFILE_CACHE_TTL_MS, async () => {
    const payload = await fetchFinnhub({
      path: '/stock/profile2',
      query: {
        symbol: normalizedSymbol,
      },
    });

    return {
      symbol: normalizedSymbol,
      name: String(payload?.name || '').trim(),
      logo: String(payload?.logo || '').trim(),
      exchange: String(payload?.exchange || '').trim(),
      currency: String(payload?.currency || '').trim(),
      ipo: String(payload?.ipo || '').trim(),
      marketCap: Number.isFinite(Number(payload?.marketCapitalization))
        ? Number(payload.marketCapitalization)
        : null,
      weburl: String(payload?.weburl || '').trim(),
      finnhubIndustry: String(payload?.finnhubIndustry || '').trim(),
    };
  });
};

export const getCandles = async (symbol, resolution, from, to) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedResolution = String(resolution || '').trim();
  const normalizedFrom = Number(from);
  const normalizedTo = Number(to);

  if (!normalizedSymbol || !normalizedResolution || !Number.isFinite(normalizedFrom) || !Number.isFinite(normalizedTo)) {
    throw new FinnhubProviderError('Invalid candle query parameters.', {
      status: 400,
      code: 'INVALID_CANDLE_QUERY',
    });
  }

  const cacheKey = `finnhub:candles:${normalizedSymbol}:${normalizedResolution}:${normalizedFrom}:${normalizedTo}`;

  return withCachedRequest(cacheKey, CANDLES_CACHE_TTL_MS, async () => {
    const { redactedUrl } = buildFinnhubUrls({
      path: '/stock/candle',
      query: {
        symbol: normalizedSymbol,
        resolution: normalizedResolution,
        from: normalizedFrom,
        to: normalizedTo,
      },
    });

    const payload = await fetchFinnhub({
      path: '/stock/candle',
      query: {
        symbol: normalizedSymbol,
        resolution: normalizedResolution,
        from: normalizedFrom,
        to: normalizedTo,
      },
    });

    const finnhubStatus = String(payload?.s || '').trim() || 'unknown';
    const closes = Array.isArray(payload?.c) ? payload.c : null;
    const timestamps = Array.isArray(payload?.t) ? payload.t : null;

    if (finnhubStatus !== 'ok' || !Array.isArray(closes) || closes.length === 0) {
      return {
        series: [],
        status: 'no_data',
        reason:
          finnhubStatus === 'no_data'
            ? 'NO_DATA_FOR_RANGE'
            : !Array.isArray(closes)
              ? 'INVALID_CANDLES_ARRAY'
              : 'PROVIDER_STATUS_NOT_OK',
        finnhubStatus,
        requestUrlWithoutToken: redactedUrl,
      };
    }

    if (!Array.isArray(timestamps) || timestamps.length === 0) {
      return {
        series: [],
        status: 'no_data',
        reason: 'INVALID_TIMESTAMPS_ARRAY',
        finnhubStatus,
        requestUrlWithoutToken: redactedUrl,
      };
    }

    const size = Math.min(timestamps.length, closes.length);
    const series = timestamps
      .slice(0, size)
      .map((timestampSeconds, index) => ({
        t: Number(timestampSeconds) * 1000,
        c: Number(closes[index]),
      }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.c));

    if (series.length === 0) {
      return {
        series: [],
        status: 'no_data',
        reason: 'EMPTY_SERIES',
        finnhubStatus,
        requestUrlWithoutToken: redactedUrl,
      };
    }

    return {
      series,
      status: 'ok',
      reason: null,
      finnhubStatus,
      requestUrlWithoutToken: redactedUrl,
    };
  });
};
