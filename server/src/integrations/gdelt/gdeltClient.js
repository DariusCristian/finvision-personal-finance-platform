import { logger } from '../../utils/logger.js';

const GDELT_DOC_API_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_BODY_SNIPPET_LENGTH = 200;
const GDELT_TIMEOUT_MS = 15000;

export const DEFAULT_NEWS_QUERY =
  'personal finance OR budgeting OR saving OR investing OR inflation OR stock market OR cryptocurrency';

export class GdeltProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GdeltProviderError';
    this.status = options.status ?? 502;
    this.context = options.context ?? {};
  }
}

const toBodySnippet = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_BODY_SNIPPET_LENGTH);
};

const parseJsonPayload = ({ text, requestUrl, status, query }) => {
  if (!text.trim().startsWith('{')) {
    logger.warn('gdelt.response.non_json_prefix', {
      requestUrl,
      status,
      query,
      bodySnippet: toBodySnippet(text),
    });

    throw new GdeltProviderError('Non-JSON response from GDELT.', {
      status: 502,
      context: {
        requestUrl,
        status,
        query,
        bodySnippet: toBodySnippet(text),
        reason: 'NON_JSON_RESPONSE',
      },
    });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    logger.warn('gdelt.response.not_json', {
      requestUrl,
      status,
      query,
      bodySnippet: toBodySnippet(text),
    });

    throw new GdeltProviderError('Non-JSON response from GDELT.', {
      status: 502,
      context: {
        requestUrl,
        status,
        query,
        bodySnippet: toBodySnippet(text),
        reason: 'NON_JSON_RESPONSE',
      },
    });
  }
};

const requestGdelt = async ({
  query,
  maxrecords,
  startdatetime,
  enddatetime,
  includeSort = true,
}) => {
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(Math.max(1, Math.min(50, Number(maxrecords) || 50))),
  });

  if (includeSort) {
    params.set('sort', 'datedesc');
  }

  if (startdatetime) {
    params.set('startdatetime', startdatetime);
  }

  if (enddatetime) {
    params.set('enddatetime', enddatetime);
  }

  const requestUrl = `${GDELT_DOC_API_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GDELT_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(requestUrl, { signal: controller.signal });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

    throw new GdeltProviderError(
      isTimeout ? 'GDELT request timed out.' : 'Could not connect to GDELT.',
      {
        status: 502,
        context: {
          requestUrl,
          query,
          reason: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown network failure',
        },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const status = response.status;
  const bodyText = await response.text();

  if (!response.ok) {
    logger.warn('gdelt.response.not_ok', {
      requestUrl,
      status,
      query,
      bodySnippet: toBodySnippet(bodyText),
    });

    if (status === 429) {
      throw new GdeltProviderError('GDELT rate limit. Try again shortly.', {
        status: 429,
        context: {
          requestUrl,
          status,
          query,
          bodySnippet: toBodySnippet(bodyText),
          reason: 'RATE_LIMITED',
        },
      });
    }

    throw new GdeltProviderError('GDELT returned a non-200 response.', {
      status: 502,
      context: {
        requestUrl,
        status,
        query,
        bodySnippet: toBodySnippet(bodyText),
        reason: 'NON_200_RESPONSE',
      },
    });
  }

  const payload = parseJsonPayload({
    text: bodyText,
    requestUrl,
    status,
    query,
  });

  return {
    payload,
    status,
    requestUrl,
  };
};

export const fetchNews = async ({
  query = DEFAULT_NEWS_QUERY,
  maxrecords = 12,
  startdatetime,
  enddatetime,
} = {}) => {
  try {
    return await requestGdelt({
      query,
      maxrecords,
      startdatetime,
      enddatetime,
      includeSort: true,
    });
  } catch (primaryError) {
    if (primaryError instanceof GdeltProviderError && primaryError.status === 429) {
      throw primaryError;
    }

    logger.warn('gdelt.request.retry_without_sort', {
      query,
      maxrecords,
      reason: primaryError instanceof Error ? primaryError.message : 'Unknown provider failure',
    });

    try {
      return await requestGdelt({
        query,
        maxrecords,
        startdatetime,
        enddatetime,
        includeSort: false,
      });
    } catch (fallbackError) {
      if (fallbackError instanceof GdeltProviderError) {
        throw fallbackError;
      }

      throw new GdeltProviderError('Failed to fetch GDELT news.', {
        status: 502,
        context: {
          query,
          reason: fallbackError instanceof Error ? fallbackError.message : 'Unknown provider failure',
        },
      });
    }
  }
};
