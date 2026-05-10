import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../components/AppShell';
import { ApiRequestError, fetchNewsArticles, type NewsArticle, type NewsTopic } from '../lib/api';

const PAGE_SIZE = 12;

const TOPIC_OPTIONS: { id: NewsTopic; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'budgeting', label: 'Budgeting' },
  { id: 'investing', label: 'Investing' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'macro', label: 'Macro' },
];

const mergeArticles = (current: NewsArticle[], incoming: NewsArticle[]) => {
  const seen = new Set(current.map((article) => article.id));
  const merged = [...current];

  incoming.forEach((article) => {
    if (!seen.has(article.id)) {
      seen.add(article.id);
      merged.push(article);
    }
  });

  return merged;
};

const parsePublishedDate = (rawValue: string) => {
  if (!rawValue) {
    return null;
  }

  const value = rawValue.trim();

  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const normalized = value.endsWith('Z') ? value.slice(0, -1) : value;
    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(4, 6));
    const day = Number(normalized.slice(6, 8));
    const hour = Number(normalized.slice(9, 11));
    const minute = Number(normalized.slice(11, 13));
    const second = Number(normalized.slice(13, 15));

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  if (/^\d{14}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatPublishedDate = (rawValue: string) => {
  const date = parsePublishedDate(rawValue);

  if (!date) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

function NewsCardSkeleton() {
  return (
    <article className="animate-pulse rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <div className="h-4 w-28 rounded-full bg-slate-100" />
      <div className="mt-4 h-5 w-full rounded-md bg-slate-100" />
      <div className="mt-2 h-5 w-4/5 rounded-md bg-slate-100" />
      <div className="mt-4 h-4 w-full rounded-md bg-slate-100" />
      <div className="mt-2 h-4 w-3/4 rounded-md bg-slate-100" />
      <div className="mt-6 h-4 w-32 rounded-md bg-slate-100" />
    </article>
  );
}

export function NewsPage() {
  const [topic, setTopic] = useState<NewsTopic>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; isRateLimited: boolean } | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);

  const requestCounterRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const loadNews = useCallback(
    async ({ pageToLoad, append }: { pageToLoad: number; append: boolean }) => {
      const requestId = requestCounterRef.current + 1;
      requestCounterRef.current = requestId;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
        setProviderNotice(null);
      }

      try {
        const payload = await fetchNewsArticles({
          topic,
          q: debouncedSearch || undefined,
          page: pageToLoad,
          limit: PAGE_SIZE,
        }, { signal: controller.signal });

        if (requestCounterRef.current !== requestId) {
          return;
        }

        setArticles((current) =>
          append ? mergeArticles(current, payload.articles) : payload.articles,
        );

        const totalApprox = payload.meta?.totalApprox ?? payload.articles.length;
        const canLoadByTotal = pageToLoad * PAGE_SIZE < totalApprox;
        const canLoadByPageSize = payload.articles.length === PAGE_SIZE;
        const providerStatusState = payload.meta?.providerStatus?.state;

        setHasMore(canLoadByTotal || canLoadByPageSize);
        setPage(pageToLoad);
        setError(null);
        setProviderNotice(
          providerStatusState === 'timeout'
            ? 'News provider is slow right now. Please try again.'
            : providerStatusState === 'rate_limited'
              ? 'News provider rate-limited. Please retry in a minute.'
              : null,
        );

        if (import.meta.env.DEV && payload.meta?.debug) {
          console.info('[news] provider debug', payload.meta.debug);
        }
      } catch (caughtError) {
        if (requestCounterRef.current !== requestId) {
          return;
        }

        const isAbortError =
          caughtError instanceof ApiRequestError && caughtError.code === 'REQUEST_ABORTED';

        if (isAbortError) {
          return;
        }

        const isRateLimited =
          caughtError instanceof ApiRequestError &&
          (caughtError.status === 429 || caughtError.code === 'RATE_LIMITED');
        const isProviderUnavailable =
          caughtError instanceof ApiRequestError && caughtError.status === 502;

        setError({
          message: isProviderUnavailable
            ? 'News provider unavailable. Please try again later.'
            : isRateLimited
              ? 'News provider rate-limited. Try again in a minute.'
              : caughtError instanceof ApiRequestError
                ? caughtError.message
                : 'Unable to load news headlines right now.',
          isRateLimited,
        });

        if (!append) {
          setArticles([]);
        }
      } finally {
        if (requestCounterRef.current === requestId) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [debouncedSearch, topic],
  );

  useEffect(() => {
    void loadNews({ pageToLoad: 1, append: false });
  }, [loadNews]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const handleLoadMore = async () => {
    if (isLoadingMore || isLoading || !hasMore) {
      return;
    }

    await loadNews({ pageToLoad: page + 1, append: true });
  };

  const handleRetry = async () => {
    await loadNews({ pageToLoad: 1, append: false });
  };

  const hasNoResults = !isLoading && !error && articles.length === 0;

  const titleSummary = useMemo(() => {
    if (debouncedSearch) {
      return `Results for “${debouncedSearch}”`;
    }

    const selectedTopic = TOPIC_OPTIONS.find((option) => option.id === topic);
    return selectedTopic ? `${selectedTopic.label} headlines` : 'Headlines';
  }, [debouncedSearch, topic]);

  return (
    <AppShell activeTab="news">
      <div className="fv-page space-y-6">
        <header className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">News</h1>
          <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
            Headlines from around the web. Click to read on the source site.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <label className="text-sm font-medium text-slate-600">
              Search
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search finance headlines"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {TOPIC_OPTIONS.map((option) => {
                const isActive = topic === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (option.id !== topic) {
                        setTopic(option.id);
                      }
                    }}
                    className={[
                      'rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{titleSummary}</h2>
            {!isLoading ? (
              <span className="text-sm text-slate-500">{articles.length} loaded</span>
            ) : null}
          </div>

          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              <p>{error.message}</p>
              <button
                type="button"
                onClick={() => {
                  void handleRetry();
                }}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                {error.isRateLimited ? 'Retry in a minute' : 'Retry'}
              </button>
            </div>
          ) : null}

          {providerNotice && !error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
              {providerNotice}
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <NewsCardSkeleton key={index} />
              ))}
            </div>
          ) : hasNoResults ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              No news articles found for this filter.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {articles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => {
                      window.open(article.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="group flex h-full flex-col rounded-[1.5rem] border border-slate-100 bg-white p-5 text-left shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(37,99,235,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                      {article.source} • {formatPublishedDate(article.publishedAt)}
                    </p>
                    <h3 className="mt-3 line-clamp-2 text-xl font-semibold tracking-[-0.02em] text-slate-900">
                      {article.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm text-slate-500">
                      {article.snippet || 'Open the source article to read the full story.'}
                    </p>
                    <p className="mt-6 text-sm font-semibold text-[#2563eb] transition group-hover:text-[#1d4ed8]">
                      Read on source →
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleLoadMore();
                  }}
                  disabled={!hasMore || isLoadingMore}
                  className={[
                    'rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                    !hasMore || isLoadingMore
                      ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                      : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]',
                  ].join(' ')}
                >
                  {isLoadingMore ? 'Loading...' : hasMore ? 'Load more' : 'No more headlines'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
