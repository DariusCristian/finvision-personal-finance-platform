import { GoogleGenAI } from '@google/genai';

import { logger } from '../../utils/logger.js';

const ai = new GoogleGenAI({});

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export class GeminiProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GeminiProviderError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'GEMINI_PROVIDER_ERROR';
    this.details = options.details ?? [];
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractStatus = (error) => {
  const candidates = [error?.status, error?.code, error?.response?.status, error?.cause?.status];

  for (const candidate of candidates) {
    const numeric = Number(candidate);

    if (Number.isFinite(numeric) && numeric >= 100 && numeric <= 599) {
      return numeric;
    }
  }

  return null;
};

const isRetryableError = (error) => {
  const status = extractStatus(error);

  if (status !== null && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  const message = String(error?.message ?? '').toLowerCase();

  return (
    message.includes('overload') ||
    message.includes('unavailable') ||
    message.includes('rate limit') ||
    message.includes('resource exhausted') ||
    message.includes('deadline') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('503') ||
    message.includes('429')
  );
};

const withTimeout = async (promise, timeoutMs) => {
  let timeoutId;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new GeminiProviderError('Gemini request timed out.', { status: 504, code: 'GEMINI_TIMEOUT' }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function generateFinnyReply({ message, systemInstruction, context }) {
  const serializedContext = JSON.stringify(context ?? {}, null, 2);
  const prompt = [
    'User message:',
    message,
    '',
    'Context JSON:',
    serializedContext,
  ].join('\n');

  const requestPayload = {
    model: 'gemini-2.5-flash',
    contents: prompt,
  };

  const config = {
    responseMimeType: 'application/json',
  };

  if (typeof systemInstruction === 'string' && systemInstruction.trim().length > 0) {
    config.systemInstruction = systemInstruction;
  }

  requestPayload.config = config;

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await withTimeout(ai.models.generateContent(requestPayload), REQUEST_TIMEOUT_MS);
      return res.text || '';
    } catch (error) {
      lastError = error;

      const retryable = isRetryableError(error);

      logger.warn('finny.gemini.request_failed', {
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        retryable,
        status: extractStatus(error),
        message: error instanceof Error ? error.message : 'Unknown Gemini error',
      });

      if (attempt < MAX_ATTEMPTS && retryable) {
        await delay(400 * attempt);
        continue;
      }

      break;
    }
  }

  throw new GeminiProviderError('Gemini provider is temporarily unavailable.', {
    status: 503,
    code: 'GEMINI_PROVIDER_ERROR',
    details: [{ message: lastError instanceof Error ? lastError.message : 'Unknown Gemini error' }],
  });
}
