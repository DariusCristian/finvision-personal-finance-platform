import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  fetchNews as fetchMarketauxNews,
  isMarketauxConfigured,
  MarketauxProviderError,
} from '../../integrations/marketaux/marketauxClient.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess } from '../../utils/response.js';
import { newsQuerySchema } from '../../validation/news.js';

const newsRouter = Router();

const CACHE_TTL_MS = 10 * 60 * 1000;
const newsCache = new Map();
const inFlightRequests = new Map();

const getCacheKey = ({ topic, q, page, limit }) => `${topic}:${q ?? ''}:${page}:${limit}`;

const getCachedPayload = (key) => {
  const cached = newsCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    newsCache.delete(key);
    return null;
  }

  return cached.payload;
};

const setCachedPayload = (key, payload) => {
  newsCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
};

const getOrCreateInFlightRequest = (key, resolver) => {
  const existingRequest = inFlightRequests.get(key);

  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = resolver().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, requestPromise);
  return requestPromise;
};

const resolvePreferredLanguage = (acceptLanguageHeader) => {
  if (typeof acceptLanguageHeader !== 'string' || acceptLanguageHeader.trim().length === 0) {
    return 'en';
  }

  const normalized = acceptLanguageHeader.toLowerCase();
  return normalized.includes('ro') ? 'ro' : 'en';
};

newsRouter.get('/', validateRequest({ query: newsQuerySchema }), async (req, res, next) => {
  const { q, topic, page, limit } = req.query;

  if (!isMarketauxConfigured()) {
    next(
      new AppError({
        message: 'Missing MARKETAUX_API_KEY',
        statusCode: 501,
        code: 'NEWS_PROVIDER_NOT_CONFIGURED',
        details: [{ reason: 'MISSING_MARKETAUX_API_KEY' }],
      }),
    );
    return;
  }

  const cacheKey = getCacheKey({ topic, q, page, limit });
  const cachedPayload = getCachedPayload(cacheKey);

  if (cachedPayload) {
    sendSuccess(res, cachedPayload.data, 200, cachedPayload.meta);
    return;
  }

  const trimmedQuery = typeof q === 'string' ? q.trim() : '';
  const language = resolvePreferredLanguage(req.headers['accept-language']);

  try {
    const responsePayload = await getOrCreateInFlightRequest(cacheKey, async () => {
      const providerResponse = await fetchMarketauxNews({
        topic,
        q: trimmedQuery,
        page,
        limit,
        language,
      });

      const data = {
        articles: providerResponse.articles,
        page: providerResponse.page,
        limit: providerResponse.limit,
      };

      const foundCount =
        typeof providerResponse?.providerMeta?.found === 'number'
          ? providerResponse.providerMeta.found
          : null;
      const returned = typeof providerResponse?.returned === 'number' ? providerResponse.returned : 0;

      if (providerResponse.articles.length === 0 && returned !== 0) {
        throw new MarketauxProviderError('News provider unavailable', {
          status: 502,
          code: 'NEWS_PROVIDER_ERROR',
          details: [
            {
              reason: 'INCONSISTENT_PROVIDER_RESPONSE',
              found: foundCount,
              returned,
            },
          ],
        });
      }

      const meta = {
        returned,
        found: foundCount,
        totalApprox: foundCount ?? providerResponse.articles.length,
      };

      if (returned === 0) {
        meta.debug = {
          search: providerResponse.search,
          providerMeta: providerResponse.providerMeta,
        };
      }

      const payload = { data, meta };
      setCachedPayload(cacheKey, payload);
      return payload;
    });

    sendSuccess(res, responsePayload.data, 200, responsePayload.meta);
  } catch (error) {
    const isProviderError = error instanceof MarketauxProviderError;

    logger.error('news.provider.failed', {
      provider: 'marketaux',
      topic,
      query: trimmedQuery || null,
      page,
      limit,
      language,
      message: error instanceof Error ? error.message : 'Unknown news provider failure',
      details: isProviderError ? error.details : [],
    });

    const statusCode = isProviderError && error.status === 501 ? 501 : 502;
    const message = statusCode === 501 ? 'Missing MARKETAUX_API_KEY' : 'News provider unavailable';

    next(
      new AppError({
        message,
        statusCode,
        code: isProviderError ? error.code : 'NEWS_PROVIDER_ERROR',
        details: isProviderError ? error.details : [{ reason: 'UNKNOWN_PROVIDER_ERROR' }],
      }),
    );
  }
});

export { newsRouter };
