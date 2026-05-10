import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import type { EducationQuizAttemptResult, EducationQuizDetail } from '../lib/api';

type QuizResultsState = {
  quiz: EducationQuizDetail;
  result: EducationQuizAttemptResult;
};

export function LearningQuizResultsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const fromState = (location.state as QuizResultsState | null) ?? null;
  const fromStorage = (() => {
    if (!id) {
      return null;
    }

    const raw = sessionStorage.getItem(`finvision.quizResult.${id}`);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as QuizResultsState;
    } catch {
      return null;
    }
  })();

  const payload = fromState ?? fromStorage;

  const feedbackWithQuestionText = useMemo(() => {
    if (!payload) {
      return [];
    }

    const promptById = new Map(payload.quiz.questions.map((question) => [question.id, question.prompt]));

    return payload.result.feedback.map((item) => ({
      ...item,
      prompt: promptById.get(item.questionId) ?? 'Question',
    }));
  }, [payload]);

  return (
    <AppShell activeTab="learning">
      <div className="space-y-5">
        <Link to="/learn" className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300">
          ← Back to Learning Center
        </Link>

        {!payload ? (
          <section className="rounded-[1.5rem] border border-slate-100 bg-white p-8 text-center shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">No quiz result loaded</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">Start the quiz again to generate fresh results.</p>
            {id ? (
              <Link
                to={`/learn/quizzes/${id}`}
                className="mt-5 inline-flex rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Retry Quiz
              </Link>
            ) : null}
          </section>
        ) : (
          <>
            <section className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Quiz Results</h1>
              <p className="mt-2 text-slate-500 dark:text-slate-400">{payload.quiz.title}</p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700/60">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Score</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{payload.result.score}%</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700/60">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Status</p>
                  <p className={['mt-2 text-3xl font-bold', payload.result.passed ? 'text-emerald-600' : 'text-rose-600'].join(' ')}>
                    {payload.result.passed ? 'Passed' : 'Not Passed'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700/60">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Attempt ID</p>
                  <p className="mt-2 truncate text-sm font-medium text-slate-700 dark:text-slate-300">{payload.result.attemptId}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Answer Review</h2>
              <div className="mt-5 space-y-4">
                {feedbackWithQuestionText.map((item) => (
                  <div key={item.questionId} className="rounded-xl border border-slate-100 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{item.prompt}</p>
                      <span className={[
                        'rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.1em]',
                        item.isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                      ].join(' ')}>
                        {item.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.explanation}</p>
                  </div>
                ))}
              </div>
            </section>

            {payload.result.recommendedNext ? (
              <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recommended Next</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Continue with another beginner quiz in the same category.</p>
                <Link
                  to={`/learn/quizzes/${payload.result.recommendedNext.id}`}
                  className="mt-4 inline-flex rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Next: {payload.result.recommendedNext.title}
                </Link>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
