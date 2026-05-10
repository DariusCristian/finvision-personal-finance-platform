const YAHOO_CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const RANGE_TO_YAHOO = {
  '1D': { range: '5d', interval: '1h', maxPoints: 48 },
  '1W': { range: '1mo', interval: '1d', maxPoints: 8 },
  '1M': { range: '1mo', interval: '1d', maxPoints: 31 },
  '6M': { range: '6mo', interval: '1d', maxPoints: 186 },
  '1Y': { range: '1y', interval: '1d', maxPoints: 366 },
  ALL: { range: '5y', interval: '1d', maxPoints: 1827 },
};

const normalizeRange = (range) => (Object.hasOwn(RANGE_TO_YAHOO, range) ? range : '1M');

const normalizeSymbol = (symbol) => String(symbol || '').trim().toUpperCase();

export const fetchYahooStockHistory = async (symbol, range = '1M') => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedRange = normalizeRange(range);

  if (!normalizedSymbol) {
    return {
      provider: 'yahoo',
      status: 'no_data',
      reason: 'INVALID_SYMBOL',
      series: [],
      requestUrlWithoutSensitive: null,
      rawResponseFirst200Chars: '',
    };
  }

  const config = RANGE_TO_YAHOO[normalizedRange] ?? RANGE_TO_YAHOO['1M'];
  const params = new URLSearchParams({
    range: config.range,
    interval: config.interval,
  });
  const requestUrl = `${YAHOO_CHART_ENDPOINT}${encodeURIComponent(normalizedSymbol)}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

    throw new Error(isTimeout ? 'YAHOO_TIMEOUT' : 'YAHOO_NETWORK_ERROR');
  }

  clearTimeout(timeoutId);

  const bodyText = await response.text();
  const rawResponseFirst200Chars = bodyText.slice(0, 200);

  if (!response.ok) {
    throw new Error(`YAHOO_NON_200_${response.status}`);
  }

  let payload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    return {
      provider: 'yahoo',
      status: 'no_data',
      reason: 'INVALID_JSON',
      series: [],
      requestUrlWithoutSensitive: requestUrl,
      rawResponseFirst200Chars,
    };
  }

  const result = Array.isArray(payload?.chart?.result) ? payload.chart.result[0] : null;
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote)
    ? result.indicators.quote[0]?.close ?? []
    : [];

  if (!Array.isArray(closes) || timestamps.length === 0) {
    return {
      provider: 'yahoo',
      status: 'no_data',
      reason: 'NO_TIMESTAMPS_OR_CLOSES',
      series: [],
      requestUrlWithoutSensitive: requestUrl,
      rawResponseFirst200Chars,
    };
  }

  const size = Math.min(timestamps.length, closes.length);
  const series = timestamps
    .slice(0, size)
    .map((ts, index) => ({
      t: Number(ts) * 1000,
      c: Number(closes[index]),
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.c))
    .sort((left, right) => left.t - right.t)
    .slice(-config.maxPoints);

  return {
    provider: 'yahoo',
    status: series.length > 0 ? 'ok' : 'no_data',
    reason: series.length > 0 ? null : 'EMPTY_SERIES',
    series,
    requestUrlWithoutSensitive: requestUrl,
    rawResponseFirst200Chars,
  };
};
