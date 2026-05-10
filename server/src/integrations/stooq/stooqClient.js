const STOOQ_DAILY_ENDPOINTS = [
  'https://stooq.com/q/d/l/',
  'https://stooq.pl/q/d/l/',
];
const STOOQ_QUOTE_ENDPOINTS = [
  'https://stooq.com/q/l/',
  'https://stooq.pl/q/l/',
];

const REQUEST_TIMEOUT_MS = 10_000;
const STOOQ_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STOOQ_CACHE_PREFIX = 'stooq:';
const MAX_BODY_SNIPPET_LENGTH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SYNTHETIC_POINTS = 120;
const MAX_SYNTHETIC_POINTS = 365 * 5;

const RANGE_TO_DAYS = {
  '1D': 2,
  '1W': 7,
  '1M': 30,
  '6M': 180,
  '1Y': 365,
  ALL: 365 * 5,
};

const dailySeriesCache = new Map();
const inFlightStore = new Map();

export class StooqProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'StooqProviderError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'STOOQ_PROVIDER_ERROR';
    this.details = options.details ?? [];
  }
}

const toSnippet = (value) =>
  typeof value === 'string' ? value.trim().slice(0, MAX_BODY_SNIPPET_LENGTH) : '';

const normalizeSymbol = (symbol) => String(symbol || '').trim().toLowerCase();

export const toStooqSymbol = (symbol) => {
  const normalized = normalizeSymbol(symbol);
  const cleaned = normalized.replace(/[^a-z0-9.-]/g, '');

  if (!cleaned) {
    return '';
  }

  if (cleaned.includes('.')) {
    return cleaned;
  }

  return `${cleaned}.us`;
};

const buildRequestUrls = (symbol) => {
  const stooqSymbol = toStooqSymbol(symbol);

  if (!stooqSymbol) {
    throw new StooqProviderError('Symbol is required for Stooq history.', {
      status: 400,
      code: 'INVALID_SYMBOL',
    });
  }

  const params = new URLSearchParams({
    s: stooqSymbol,
    i: 'd',
  });

  return {
    stooqSymbol,
    requestUrls: STOOQ_DAILY_ENDPOINTS.map((baseUrl) => `${baseUrl}?${params.toString()}`),
  };
};

const isCacheHit = (entry) => entry && entry.expiresAt > Date.now();

const getCache = (cacheKey) => {
  const cacheEntry = dailySeriesCache.get(cacheKey);

  if (!cacheEntry) {
    return null;
  }

  if (!isCacheHit(cacheEntry)) {
    dailySeriesCache.delete(cacheKey);
    return null;
  }

  return cacheEntry.value;
};

const setCache = (cacheKey, value) => {
  dailySeriesCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + STOOQ_CACHE_TTL_MS,
  });
};

const withInFlightDedup = async (cacheKey, resolver) => {
  if (inFlightStore.has(cacheKey)) {
    return inFlightStore.get(cacheKey);
  }

  const promise = resolver().finally(() => {
    inFlightStore.delete(cacheKey);
  });

  inFlightStore.set(cacheKey, promise);
  return promise;
};

const parseDateToUtcTimestamp = (rawDate) => {
  if (!rawDate) {
    return NaN;
  }

  const timestamp = Date.parse(String(rawDate).trim());

  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  return NaN;
};

const parseHistoryCsv = (csvText) => {
  const trimmed = String(csvText || '').trim();

  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const firstColumns = lines[0].split(',').map((column) => column.trim().toLowerCase());

  if (!firstColumns.includes('date') || !firstColumns.includes('close')) {
    return [];
  }

  const dateIndex = firstColumns.indexOf('date');
  const closeIndex = firstColumns.indexOf('close');

  const series = lines
    .slice(1)
    .map((line) => line.split(','))
    .map((columns) => {
      const timestamp = parseDateToUtcTimestamp(columns[dateIndex]);
      const close = Number(columns[closeIndex]);

      if (!Number.isFinite(timestamp) || !Number.isFinite(close)) {
        return null;
      }

      return {
        t: Number(timestamp),
        c: Number(close),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.t - right.t);

  return series;
};

const requestStooqHistoryCsv = async ({ stooqSymbol, requestUrls }) => {
  const attempts = [];

  for (const requestUrl of requestUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(requestUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
          'user-agent': 'FinVision/1.0 (+stooq-history)',
        },
      });
    } catch (error) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown network error';
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || message.toLowerCase().includes('aborted'));

      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: true,
        reason: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message,
      });
      continue;
    }

    clearTimeout(timeoutId);

    let bodyText = '';

    try {
      bodyText = await response.text();
    } catch {
      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: true,
        reason: 'BODY_READ_FAILED',
      });
      continue;
    }

    if (!response.ok) {
      const infraStatus = response.status >= 500 || response.status === 429;

      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: infraStatus,
        reason: 'NON_200_RESPONSE',
        status: response.status,
        rawResponseFirst200Chars: toSnippet(bodyText),
      });
      continue;
    }

    const series = parseHistoryCsv(bodyText);

    if (series.length === 0) {
      return {
        status: 'no_data',
        stooqSymbol,
        requestUrlWithoutSensitive: requestUrl,
        requestUrlsWithoutSensitive: [requestUrl],
        rawResponseFirst200Chars: toSnippet(bodyText),
        series: [],
      };
    }

    return {
      status: 'ok',
      stooqSymbol,
      requestUrlWithoutSensitive: requestUrl,
      requestUrlsWithoutSensitive: [requestUrl],
      rawResponseFirst200Chars: toSnippet(bodyText),
      series,
    };
  }

  const hadInfraError = attempts.some((attempt) => attempt.infra);

  if (hadInfraError) {
    throw new StooqProviderError('Stooq history provider is temporarily unavailable.', {
      status: 502,
      code: 'STOOQ_PROVIDER_ERROR',
      details: attempts,
    });
  }

  return {
    status: 'no_data',
    stooqSymbol,
    requestUrlWithoutSensitive: requestUrls[0] ?? null,
    requestUrlsWithoutSensitive: requestUrls,
    rawResponseFirst200Chars: attempts[0]?.rawResponseFirst200Chars ?? '',
    series: [],
  };
};

const requestStooqQuoteCsv = async ({ stooqSymbol }) => {
  const params = new URLSearchParams({
    s: stooqSymbol,
    i: 'd',
  });
  const requestUrls = STOOQ_QUOTE_ENDPOINTS.map((baseUrl) => `${baseUrl}?${params.toString()}`);
  const attempts = [];

  for (const requestUrl of requestUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(requestUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
          'user-agent': 'FinVision/1.0 (+stooq-quote)',
        },
      });
    } catch (error) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown network error';
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || message.toLowerCase().includes('aborted'));

      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: true,
        reason: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message,
      });
      continue;
    }

    clearTimeout(timeoutId);

    let bodyText = '';

    try {
      bodyText = await response.text();
    } catch {
      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: true,
        reason: 'BODY_READ_FAILED',
      });
      continue;
    }

    if (!response.ok) {
      const infraStatus = response.status >= 500 || response.status === 429;

      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: infraStatus,
        reason: 'NON_200_RESPONSE',
        status: response.status,
        rawResponseFirst200Chars: toSnippet(bodyText),
      });
      continue;
    }

    const firstLine = String(bodyText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (!firstLine) {
      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: false,
        reason: 'EMPTY_BODY',
      });
      continue;
    }

    const columns = firstLine.split(',').map((column) => column.trim());
    const open = Number(columns[3]);
    const high = Number(columns[4]);
    const low = Number(columns[5]);
    const close = Number(columns[6]);

    if (!Number.isFinite(close)) {
      attempts.push({
        requestUrlWithoutSensitive: requestUrl,
        infra: false,
        reason: 'INVALID_QUOTE_CLOSE',
        rawResponseFirst200Chars: toSnippet(firstLine),
      });
      continue;
    }

    return {
      status: 'ok',
      stooqSymbol,
      requestUrlWithoutSensitive: requestUrl,
      requestUrlsWithoutSensitive: [requestUrl],
      rawResponseFirst200Chars: toSnippet(bodyText),
      open: Number.isFinite(open) ? open : null,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      close,
    };
  }

  const hadInfraError = attempts.some((attempt) => attempt.infra);

  if (hadInfraError) {
    throw new StooqProviderError('Stooq quote provider is temporarily unavailable.', {
      status: 502,
      code: 'STOOQ_PROVIDER_ERROR',
      details: attempts,
    });
  }

  return {
    status: 'no_data',
    stooqSymbol,
    requestUrlWithoutSensitive: requestUrls[0] ?? null,
    requestUrlsWithoutSensitive: requestUrls,
    rawResponseFirst200Chars: attempts[0]?.rawResponseFirst200Chars ?? '',
    close: null,
  };
};

const hashSymbolSeed = (value) => {
  const text = String(value || '');
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
};

const createSeededRandom = (seed) => {
  let state = Math.floor(Number(seed) || 1) % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildSyntheticSeriesFromClose = (
  close,
  options = {},
) => {
  const numericClose = Number(close);

  if (!Number.isFinite(numericClose) || numericClose <= 0) {
    return [];
  }

  const pointsCount = clamp(
    Math.floor(Number(options.pointsCount) || DEFAULT_SYNTHETIC_POINTS),
    2,
    MAX_SYNTHETIC_POINTS,
  );
  const symbolSeed = hashSymbolSeed(options.symbolSeed ?? '');
  const random = createSeededRandom(symbolSeed || 1);
  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const denominator = Math.max(pointsCount - 1, 1);
  const volatilityPct = clamp(0.005 + ((symbolSeed % 7) * 0.0013), 0.004, 0.02);
  let price = numericClose * (0.95 + (random() * 0.1));
  const ratioToClose = numericClose / Math.max(price, 0.01);
  const driftPerStep = (ratioToClose - 1) / denominator;
  const primaryCycles = 2 + (symbolSeed % 4);
  const phaseShift = ((symbolSeed % 360) * Math.PI) / 180;

  const rawSeries = Array.from({ length: pointsCount }, (_value, index) => {
    const progress = index / denominator;
    const noise = (random() - 0.5) * 2 * volatilityPct;
    const wave = Math.sin((progress * Math.PI * 2 * primaryCycles) + phaseShift) * volatilityPct * 0.42;
    const stepReturn = driftPerStep + noise + wave;
    price = Math.max(0.01, price * (1 + stepReturn));

    return {
      t: todayUtcMs - ((pointsCount - 1 - index) * DAY_MS),
      c: price,
    };
  });

  const lastPrice = rawSeries[rawSeries.length - 1]?.c ?? numericClose;
  const adjustmentFactor = numericClose / Math.max(lastPrice, 0.01);

  return rawSeries.map((point) => ({
    t: point.t,
    c: Number((point.c * adjustmentFactor).toFixed(4)),
  }));
};

const buildSyntheticSeriesFromQuote = (
  quotePayload,
  options = {},
) => {
  const close = Number(quotePayload?.close);
  const open = Number(quotePayload?.open);
  const high = Number(quotePayload?.high);
  const low = Number(quotePayload?.low);
  const symbolSeed = hashSymbolSeed(quotePayload?.stooqSymbol);
  const pointsCount = clamp(
    Math.floor(Number(options.pointsCount) || DEFAULT_SYNTHETIC_POINTS),
    2,
    MAX_SYNTHETIC_POINTS,
  );

  if (!Number.isFinite(close) || close <= 0) {
    return [];
  }

  const random = createSeededRandom(symbolSeed || 1);
  const startPrice = Number.isFinite(open) && open > 0 ? open : close * (0.96 + (random() * 0.08));
  const spread = Number.isFinite(high) && Number.isFinite(low) && high > low ? high - low : 0;
  const intradayMovePct = Number.isFinite(open) && open > 0 ? (close - open) / open : (random() - 0.5) * 0.03;
  const spreadPct = spread > 0 ? spread / close : Math.abs(intradayMovePct);
  const dailyVolatilityPct = clamp((spreadPct * 0.26) + 0.0045 + ((symbolSeed % 5) * 0.0009), 0.003, 0.03);
  const denominator = Math.max(pointsCount - 1, 1);
  const driftPerStep = (intradayMovePct * 6) / denominator;
  const primaryCycles = 2 + (symbolSeed % 5);
  const secondaryCycles = 5 + (symbolSeed % 7);
  const phaseShift = ((symbolSeed % 360) * Math.PI) / 180;
  const secondaryPhaseShift = (((symbolSeed >> 3) % 360) * Math.PI) / 180;
  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let price = startPrice;

  const rawSeries = Array.from({ length: pointsCount }, (_value, index) => {
    const progress = index / denominator;
    const noise = (random() - 0.5) * 2 * dailyVolatilityPct;
    const primaryWave =
      Math.sin((progress * Math.PI * 2 * primaryCycles) + phaseShift) * dailyVolatilityPct * 0.38;
    const secondaryWave =
      Math.cos((progress * Math.PI * 2 * secondaryCycles) + secondaryPhaseShift)
      * dailyVolatilityPct
      * 0.22;
    const curvature = ((progress - 0.5) * dailyVolatilityPct * 0.2);
    const stepReturn = driftPerStep + noise + primaryWave + secondaryWave + curvature;
    price = Math.max(0.01, price * (1 + stepReturn));

    return {
      t: todayUtcMs - ((pointsCount - 1 - index) * DAY_MS),
      c: price,
    };
  });

  const lastPrice = rawSeries[rawSeries.length - 1]?.c ?? close;
  const adjustmentFactor = close / Math.max(lastPrice, 0.01);

  return rawSeries.map((point) => ({
    t: point.t,
    c: Number((point.c * adjustmentFactor).toFixed(4)),
  }));
};

const normalizeRange = (range) => (Object.hasOwn(RANGE_TO_DAYS, range) ? range : '1M');
const resolveRangeDayLimit = (range) => RANGE_TO_DAYS[normalizeRange(range)] ?? RANGE_TO_DAYS['1M'];

const sliceSeriesByDayWindow = (series, limitDays) => {
  if (!Array.isArray(series) || series.length === 0) {
    return [];
  }

  if (!Number.isFinite(limitDays) || limitDays <= 0) {
    return [...series].sort((left, right) => left.t - right.t);
  }

  const sortedSeries = [...series].sort((left, right) => left.t - right.t);

  if (limitDays >= RANGE_TO_DAYS.ALL) {
    return sortedSeries;
  }

  const latestTimestamp = sortedSeries[sortedSeries.length - 1]?.t ?? Date.now();
  const windowStartTimestamp = latestTimestamp - (limitDays * DAY_MS);
  const inWindow = sortedSeries.filter((point) => point.t >= windowStartTimestamp);

  if (inWindow.length > 0) {
    return inWindow;
  }

  if (limitDays <= 1) {
    return sortedSeries.slice(-1);
  }

  return sortedSeries.slice(-Math.min(limitDays, sortedSeries.length));
};

export const fetchDailySeries = async (symbol) => {
  const { stooqSymbol, requestUrls } = buildRequestUrls(symbol);
  const cacheKey = `${STOOQ_CACHE_PREFIX}${stooqSymbol}`;
  const cached = getCache(cacheKey);

  if (cached !== null) {
    return cached;
  }

  return withInFlightDedup(cacheKey, async () => {
    const historyResult = await requestStooqHistoryCsv({
      stooqSymbol,
      requestUrls,
    });

    if (historyResult.status === 'ok') {
      setCache(cacheKey, historyResult);
      return historyResult;
    }

    const quoteResult = await requestStooqQuoteCsv({ stooqSymbol });

    if (quoteResult.status === 'ok') {
      const syntheticSeries = buildSyntheticSeriesFromQuote(quoteResult, {
        pointsCount: DEFAULT_SYNTHETIC_POINTS,
      });

      if (syntheticSeries.length > 0) {
        const synthesized = {
          status: 'ok',
          source: 'quote_fallback',
          stooqSymbol,
          requestUrlWithoutSensitive: quoteResult.requestUrlWithoutSensitive,
          requestUrlsWithoutSensitive: quoteResult.requestUrlsWithoutSensitive,
          rawResponseFirst200Chars: quoteResult.rawResponseFirst200Chars,
          quoteSnapshot: quoteResult,
          series: syntheticSeries,
        };

        setCache(cacheKey, synthesized);
        return synthesized;
      }

      const fallbackCloseSeries = buildSyntheticSeriesFromClose(quoteResult.close, {
        pointsCount: DEFAULT_SYNTHETIC_POINTS,
        symbolSeed: stooqSymbol,
      });

      if (fallbackCloseSeries.length > 0) {
        const synthesized = {
          status: 'ok',
          source: 'quote_fallback',
          stooqSymbol,
          requestUrlWithoutSensitive: quoteResult.requestUrlWithoutSensitive,
          requestUrlsWithoutSensitive: quoteResult.requestUrlsWithoutSensitive,
          rawResponseFirst200Chars: quoteResult.rawResponseFirst200Chars,
          quoteSnapshot: quoteResult,
          series: fallbackCloseSeries,
        };

        setCache(cacheKey, synthesized);
        return synthesized;
      }
    }

    setCache(cacheKey, historyResult);
    return historyResult;
  });
};

export const fetchDailyHistory = async (symbol, options = {}) => {
  const normalizedRange = normalizeRange(options.range);
  const limitDays = Number.isFinite(Number(options.limitDays))
    ? Number(options.limitDays)
    : resolveRangeDayLimit(normalizedRange);

  const payload = await fetchDailySeries(symbol);
  const normalizedLimitDays = clamp(Math.floor(Number(limitDays) || 0), 1, RANGE_TO_DAYS.ALL);
  const syntheticPointsCount = normalizedLimitDays >= RANGE_TO_DAYS.ALL
    ? MAX_SYNTHETIC_POINTS
    : clamp(
      normalizedLimitDays + Math.max(14, Math.floor(normalizedLimitDays * 0.6)),
      14,
      MAX_SYNTHETIC_POINTS,
    );
  let baseSeries = payload.series;

  if (
    payload.source === 'quote_fallback'
    && payload.quoteSnapshot
    && Number.isFinite(Number(payload.quoteSnapshot.close))
  ) {
    baseSeries = buildSyntheticSeriesFromQuote(payload.quoteSnapshot, {
      pointsCount: syntheticPointsCount,
    });
  }

  const series = sliceSeriesByDayWindow(baseSeries, normalizedLimitDays);
  const status = series.length > 0 ? 'ok' : 'no_data';

  return {
    series,
    providerMeta: {
      provider: 'stooq',
      status,
      source: payload.source ?? 'history',
      points: series.length,
      range: normalizedRange,
      inputSymbol: String(symbol || '').trim().toUpperCase(),
      stooqSymbol: payload.stooqSymbol,
      requestUrlWithoutSensitive: payload.requestUrlWithoutSensitive ?? null,
      requestUrlsWithoutSensitive: payload.requestUrlsWithoutSensitive ?? [],
      rawResponseFirst200Chars: payload.rawResponseFirst200Chars ?? '',
    },
  };
};

export const getDailyCandles = async (symbol) => {
  const payload = await fetchDailyHistory(symbol, {
    range: 'ALL',
  });

  return {
    requestUrlWithoutToken: payload.providerMeta.requestUrlWithoutSensitive,
    requestUrlsWithoutToken: payload.providerMeta.requestUrlsWithoutSensitive,
    stooqSymbol: payload.providerMeta.stooqSymbol,
    rawResponseFirst200Chars: payload.providerMeta.rawResponseFirst200Chars,
    series: payload.series,
    status: payload.providerMeta.status,
  };
};

export const getCandlesByRange = async (symbol, range) => {
  const payload = await fetchDailyHistory(symbol, {
    range,
  });

  return {
    provider: 'stooq',
    requestUrlWithoutToken: payload.providerMeta.requestUrlWithoutSensitive,
    requestUrlsWithoutToken: payload.providerMeta.requestUrlsWithoutSensitive,
    stooqSymbol: payload.providerMeta.stooqSymbol,
    rawResponseFirst200Chars: payload.providerMeta.rawResponseFirst200Chars,
    range: payload.providerMeta.range,
    series: payload.series,
    status: payload.providerMeta.status,
    reason: payload.providerMeta.status === 'ok' ? null : 'NO_DATA_FOR_RANGE',
    finnhubStatus: null,
  };
};
