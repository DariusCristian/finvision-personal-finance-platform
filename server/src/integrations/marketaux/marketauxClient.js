import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const MARKETAUX_API_URL = 'https://api.marketaux.com/v1/news/all';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_BODY_SNIPPET_LENGTH = 200;
const MAX_NEWS_LIMIT = 20;

const TOPIC_KEYWORDS = {
  budgeting: 'budget budgeting saving expenses',
  investing: 'investing stocks etf portfolio',
  crypto: 'crypto bitcoin ethereum',
  macro: 'inflation interest rates economy',
};

export class MarketauxProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MarketauxProviderError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'NEWS_PROVIDER_ERROR';
    this.details = options.details ?? [];
  }
}

const toBodySnippet = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_BODY_SNIPPET_LENGTH);
};

const getTopicKeywords = (topic) => TOPIC_KEYWORDS[topic] ?? '';

const buildSearchQuery = ({ topic, q }) => {
  const topicKeywords = topic !== 'all' ? getTopicKeywords(topic) : '';
  const trimmedQuery = typeof q === 'string' ? q.trim() : '';
  const values = [];

  if (topicKeywords) {
    values.push(topicKeywords);
  }

  if (trimmedQuery) {
    values.push(trimmedQuery);
  }

  return values.join(' ').trim();
};

const normalizeLanguage = (language) => {
  if (typeof language !== 'string') {
    return 'en';
  }

  return language.toLowerCase() === 'ro' ? 'ro' : 'en';
};

const getPublishedAfterDate = (days = 7) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const normalizeArticle = (item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const url =
    typeof item.url === 'string' && item.url.trim().length > 0
      ? item.url.trim()
      : typeof item.link === 'string' && item.link.trim().length > 0
        ? item.link.trim()
        : '';

  if (!url) {
    return null;
  }

  const title =
    typeof item.title === 'string' && item.title.trim().length > 0
      ? item.title.trim()
      : 'Untitled';

  const publishedAt =
    typeof item.published_at === 'string' && item.published_at.trim().length > 0
      ? item.published_at.trim()
      : typeof item.publishedAt === 'string' && item.publishedAt.trim().length > 0
        ? item.publishedAt.trim()
        : '';

  const source =
    typeof item.source === 'string' && item.source.trim().length > 0
      ? item.source.trim()
      : typeof item.source_name === 'string' && item.source_name.trim().length > 0
        ? item.source_name.trim()
        : typeof item.domain === 'string' && item.domain.trim().length > 0
          ? item.domain.trim()
          : 'Source';

  const snippet =
    typeof item.snippet === 'string' && item.snippet.trim().length > 0
      ? item.snippet.trim()
      : typeof item.description === 'string' && item.description.trim().length > 0
        ? item.description.trim()
        : typeof item.summary === 'string' && item.summary.trim().length > 0
          ? item.summary.trim()
          : '';

  const id =
    typeof item.uuid === 'string' && item.uuid.trim().length > 0
      ? item.uuid.trim()
      : url;

  return {
    id,
    title,
    source,
    publishedAt,
    url,
    snippet,
  };
};

export const isMarketauxConfigured = () =>
  typeof env.MARKETAUX_API_KEY === 'string' && env.MARKETAUX_API_KEY.trim().length > 0;

export const fetchNews = async ({ topic = 'all', q, page = 1, limit = 12, language = 'en' } = {}) => {
  if (!isMarketauxConfigured()) {
    throw new MarketauxProviderError('Missing MARKETAUX_API_KEY', {
      status: 501,
      code: 'NEWS_PROVIDER_NOT_CONFIGURED',
      details: [{ reason: 'MISSING_MARKETAUX_API_KEY' }],
    });
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(MAX_NEWS_LIMIT, Number(limit) || MAX_NEWS_LIMIT));
  const search = buildSearchQuery({ topic, q });

  const params = new URLSearchParams({
    api_token: env.MARKETAUX_API_KEY,
    language: normalizeLanguage(language),
    page: String(safePage),
    limit: String(safeLimit),
    published_after: getPublishedAfterDate(7),
  });

  if (search) {
    params.set('search', search);
  }

  const requestUrl = `${MARKETAUX_API_URL}?${params.toString()}`;
  const redactedParams = new URLSearchParams(params);
  redactedParams.set('api_token', '[REDACTED]');
  const redactedRequestUrl = `${MARKETAUX_API_URL}?${redactedParams.toString()}`;

  if (env.NODE_ENV === 'development') {
    logger.info('news.marketaux.request', {
      requestUrl: redactedRequestUrl,
      topic,
      page: safePage,
      limit: safeLimit,
      search: search || null,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(requestUrl, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

    throw new MarketauxProviderError(
      isTimeout ? 'Marketaux request timed out.' : 'Could not connect to Marketaux.',
      {
        status: 502,
        code: 'NEWS_PROVIDER_ERROR',
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
    logger.warn('news.marketaux.not_ok', {
      status: response.status,
      bodySnippet: toBodySnippet(bodyText),
      page: safePage,
      limit: safeLimit,
    });

    throw new MarketauxProviderError('News provider unavailable', {
      status: 502,
      code: 'NEWS_PROVIDER_ERROR',
      details: [{ reason: 'NON_200_RESPONSE', status: response.status }],
    });
  }

  if (!bodyText.trim().startsWith('{')) {
    throw new MarketauxProviderError('News provider returned a non-JSON response.', {
      status: 502,
      code: 'NEWS_PROVIDER_ERROR',
      details: [{ reason: 'NON_JSON_RESPONSE', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  let payload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new MarketauxProviderError('News provider returned invalid JSON.', {
      status: 502,
      code: 'NEWS_PROVIDER_ERROR',
      details: [{ reason: 'INVALID_JSON', bodySnippet: toBodySnippet(bodyText) }],
    });
  }

  if (payload?.error) {
    throw new MarketauxProviderError('News provider unavailable', {
      status: 502,
      code: 'NEWS_PROVIDER_ERROR',
      details: [
        {
          reason: 'PROVIDER_ERROR',
          providerError: payload.error,
        },
      ],
    });
  }

  const sourceItems = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  const articles = sourceItems.map(normalizeArticle).filter(Boolean);
  const providerMeta = payload?.meta ?? {};
  const returnedCount =
    typeof providerMeta?.returned === 'number' ? providerMeta.returned : articles.length;

  if (env.NODE_ENV === 'development') {
    logger.info('news.marketaux.response', {
      requestUrl: redactedRequestUrl,
      found: typeof providerMeta?.found === 'number' ? providerMeta.found : null,
      returned: returnedCount,
      articles: articles.length,
      search: search || null,
    });
  }

  return {
    articles,
    page: safePage,
    limit: safeLimit,
    providerMeta,
    returned: returnedCount,
    search: search || '',
    requestUrl: redactedRequestUrl,
  };
};
