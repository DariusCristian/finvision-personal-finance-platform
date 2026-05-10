import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  fetchEducationArticles,
  fetchEducationProgress,
  fetchEducationQuizzes,
  type EducationArticleSummary,
  type EducationProgress,
  type EducationQuizSummary,
} from '../lib/api';

type ActiveTab = 'articles' | 'quizzes';
type Difficulty = 'all' | 'beginner' | 'intermediate' | 'advanced';

const difficultyClass = (difficulty: string) => {
  switch (difficulty) {
    case 'advanced':
      return 'bg-rose-50 text-rose-600';
    case 'intermediate':
      return 'bg-amber-50 text-amber-600';
    default:
      return 'bg-emerald-50 text-emerald-600';
  }
};

export function LearningCenterPage() {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('articles');
  const [articles, setArticles] = useState<EducationArticleSummary[]>([]);
  const [quizzes, setQuizzes] = useState<EducationQuizSummary[]>([]);
  const [progress, setProgress] = useState<EducationProgress | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty>('all');
  const [searchValue, setSearchValue] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [isLoadingProgress, setIsLoadingProgress] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadContent = async () => {
      setIsLoadingContent(true);
      setLoadError(null);

      try {
        const [articlesPayload, quizzesPayload] = await Promise.all([
          fetchEducationArticles({
            category: categoryFilter === 'all' ? undefined : categoryFilter,
            difficulty: difficultyFilter === 'all' ? undefined : difficultyFilter,
            search: searchValue.trim() || undefined,
          }),
          fetchEducationQuizzes({
            category: categoryFilter === 'all' ? undefined : categoryFilter,
            difficulty: difficultyFilter === 'all' ? undefined : difficultyFilter,
          }),
        ]);

        setArticles(articlesPayload.articles);
        setQuizzes(quizzesPayload.quizzes);
      } catch (error) {
        setLoadError(
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to load Learning Center content right now.',
        );
      } finally {
        setIsLoadingContent(false);
      }
    };

    void loadContent();
  }, [categoryFilter, difficultyFilter, searchValue]);

  useEffect(() => {
    if (!accessToken) {
      setIsLoadingProgress(false);
      setProgress(null);
      return;
    }

    const loadProgress = async () => {
      setIsLoadingProgress(true);

      try {
        const payload = await fetchEducationProgress(accessToken);
        setProgress(payload.progress);
      } catch {
        setProgress(null);
      } finally {
        setIsLoadingProgress(false);
      }
    };

    void loadProgress();
  }, [accessToken]);

  const categories = useMemo(() => {
    const categorySet = new Set<string>();

    articles.forEach((article) => categorySet.add(article.category));
    quizzes.forEach((quiz) => categorySet.add(quiz.category));

    return ['all', ...Array.from(categorySet).sort((left, right) => left.localeCompare(right))];
  }, [articles, quizzes]);

  const activeCount = activeTab === 'articles' ? articles.length : quizzes.length;

  return (
    <AppShell activeTab="learning">
      <div className="fv-page space-y-6">
        <header className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563eb]">Learning Center</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Financial Learning Center</h1>
              <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">Learn core money concepts and test yourself with guided quizzes.</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {isLoadingProgress ? (
                <span>Loading progress...</span>
              ) : progress ? (
                <div className="space-y-1 text-right">
                  <p><span className="font-semibold text-slate-900">XP:</span> {progress.xp}</p>
                  <p><span className="font-semibold text-slate-900">Level:</span> {progress.level}</p>
                  <p><span className="font-semibold text-slate-900">Quiz Accuracy:</span> {progress.quizAccuracyPct}%</p>
                </div>
              ) : (
                <span>Progress will appear after your first completion.</span>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <label className="text-sm font-medium text-slate-600">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All categories' : category}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-600">
              Difficulty
              <select
                value={difficultyFilter}
                onChange={(event) => setDifficultyFilter(event.target.value as Difficulty)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>

            <label className="text-sm font-medium text-slate-600 md:col-span-2">
              Search
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search topics"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-6 inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('articles')}
              className={[
                'rounded-lg px-4 py-2 text-sm font-medium transition',
                activeTab === 'articles' ? 'bg-white text-[#2563eb] shadow-sm' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              Articles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('quizzes')}
              className={[
                'rounded-lg px-4 py-2 text-sm font-medium transition',
                activeTab === 'quizzes' ? 'bg-white text-[#2563eb] shadow-sm' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              Quizzes
            </button>
          </div>
        </header>

        {loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {loadError}
          </div>
        ) : null}

        {isLoadingContent ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-[1.5rem] border border-slate-100 bg-white" />
            ))}
          </section>
        ) : activeCount === 0 ? (
          <section className="rounded-[1.5rem] border border-slate-100 bg-white p-10 text-center text-slate-500 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
            No {activeTab} match the selected filters.
          </section>
        ) : activeTab === 'articles' ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                to={`/learn/articles/${article.slug}`}
                className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(37,99,235,0.35)]"
              >
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <span>{article.category}</span>
                  <span className={['rounded-full px-2 py-1 font-semibold', difficultyClass(article.difficulty)].join(' ')}>
                    {article.difficulty}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-slate-900">{article.title}</h3>
                <p className="mt-3 line-clamp-3 text-sm text-slate-500">{article.excerpt}</p>
                <p className="mt-5 text-sm font-medium text-[#2563eb]">{article.estimatedMinutes} min read</p>
              </Link>
            ))}
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => (
              <Link
                key={quiz.id}
                to={`/learn/quizzes/${quiz.id}`}
                className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(37,99,235,0.35)]"
              >
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <span>{quiz.category}</span>
                  <span className={['rounded-full px-2 py-1 font-semibold', difficultyClass(quiz.difficulty)].join(' ')}>
                    {quiz.difficulty}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-slate-900">{quiz.title}</h3>
                <p className="mt-3 text-sm text-slate-500">
                  {quiz.questionCount} questions • Passing score {quiz.passingScore}%
                </p>
                <p className="mt-5 text-sm font-medium text-[#2563eb]">Start quiz</p>
              </Link>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
