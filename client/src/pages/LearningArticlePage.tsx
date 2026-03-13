import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  completeEducationArticle,
  fetchEducationArticle,
  type EducationArticleDetail,
  type EducationContentBlock,
} from '../lib/api';

const renderBlock = (block: EducationContentBlock, index: number) => {
  if (block.type === 'bulletList') {
    return (
      <ul key={index} className="list-disc space-y-2 pl-6 text-slate-700">
        {(block.items ?? []).map((item, itemIndex) => (
          <li key={itemIndex}>{item}</li>
        ))}
      </ul>
    );
  }

  if (block.type === 'callout') {
    return (
      <div key={index} className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-slate-700">
        {block.text}
      </div>
    );
  }

  return (
    <p key={index} className="text-slate-700">
      {block.text}
    </p>
  );
};

export function LearningArticlePage() {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const { accessToken } = useAuth();
  const [article, setArticle] = useState<EducationArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!slugOrId) {
      return;
    }

    const loadArticle = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const payload = await fetchEducationArticle(slugOrId);
        setArticle(payload.article);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to load article details right now.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadArticle();
  }, [slugOrId]);

  const canComplete = useMemo(() => Boolean(accessToken && article), [accessToken, article]);

  const handleMarkCompleted = async () => {
    if (!accessToken || !article) {
      return;
    }

    setIsCompleting(true);
    setStatusMessage(null);

    try {
      const payload = await completeEducationArticle(article.id, accessToken);
      setStatusMessage(
        `Marked complete. Progress updated: ${payload.progress.completedArticlesCount} completed article(s).`,
      );
    } catch (error) {
      setStatusMessage(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to mark article as completed right now.',
      );
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <AppShell activeTab="learning">
      <div className="space-y-5">
        <Link to="/learn" className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]">
          ← Back to Learning Center
        </Link>

        {isLoading ? (
          <div className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="space-y-3">
              <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {errorMessage}
          </div>
        ) : article ? (
          <article className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-slate-500">
              <span>{article.category}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                {article.difficulty}
              </span>
              <span>{article.estimatedMinutes} min read</span>
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-900">{article.title}</h1>
            <p className="mt-3 text-lg text-slate-500">{article.excerpt}</p>

            <div className="mt-8 space-y-5 leading-relaxed">
              {article.contentBlocks.map((block, index) => renderBlock(block, index))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canComplete || isCompleting}
                onClick={() => {
                  void handleMarkCompleted();
                }}
                className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isCompleting ? 'Saving...' : 'Mark as completed'}
              </button>
              {statusMessage ? <p className="text-sm text-slate-500">{statusMessage}</p> : null}
            </div>
          </article>
        ) : null}
      </div>
    </AppShell>
  );
}
