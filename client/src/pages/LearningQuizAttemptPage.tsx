import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  fetchEducationQuiz,
  submitEducationQuizAttempt,
  type EducationQuizAttemptResult,
  type EducationQuizDetail,
} from '../lib/api';

export function LearningQuizAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [quiz, setQuiz] = useState<EducationQuizDetail | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadQuiz = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const payload = await fetchEducationQuiz(id);
        setQuiz(payload.quiz);
        setCurrentIndex(0);
        setSelectedAnswers({});
        startedAtRef.current = Date.now();
      } catch (error) {
        setErrorMessage(
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to load quiz right now.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadQuiz();
  }, [id]);

  const currentQuestion = useMemo(() => {
    if (!quiz) {
      return null;
    }

    return quiz.questions[currentIndex] ?? null;
  }, [quiz, currentIndex]);

  const answeredCount = useMemo(
    () => Object.values(selectedAnswers).filter(Boolean).length,
    [selectedAnswers],
  );

  const canSubmit = Boolean(quiz && answeredCount === quiz.questions.length);

  const handleSelectOption = (questionId: string, optionId: string) => {
    setSelectedAnswers((current) => ({
      ...current,
      [questionId]: optionId,
    }));
  };

  const handleSubmit = async () => {
    if (!quiz || !accessToken) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const answers = quiz.questions
        .map((question) => ({
          questionId: question.id,
          selectedOptionId: selectedAnswers[question.id],
        }))
        .filter((answer) => Boolean(answer.selectedOptionId));

      const result: EducationQuizAttemptResult = await submitEducationQuizAttempt(
        quiz.id,
        {
          answers,
          timeSpentSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
        },
        accessToken,
      );

      sessionStorage.setItem(
        `finvision.quizResult.${quiz.id}`,
        JSON.stringify({ quiz, result }),
      );

      navigate(`/learn/quizzes/${quiz.id}/results`, {
        state: {
          quiz,
          result,
        },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to submit quiz right now.',
      );
    } finally {
      setIsSubmitting(false);
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
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {errorMessage}
          </div>
        ) : quiz && currentQuestion ? (
          <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900">{quiz.title}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  {quiz.category} • {quiz.difficulty} • Passing score {quiz.passingScore}%
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {currentIndex + 1}/{quiz.questions.length}
              </span>
            </div>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#2563eb] transition-all"
                style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
              />
            </div>

            <div className="mt-8 space-y-4">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{currentQuestion.prompt}</h2>
              <div className="space-y-3">
                {currentQuestion.options.map((option) => {
                  const isSelected = selectedAnswers[currentQuestion.id] === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectOption(currentQuestion.id, option.id)}
                      className={[
                        'w-full rounded-xl border px-4 py-3 text-left text-sm transition',
                        isSelected
                          ? 'border-[#2563eb] bg-blue-50 text-[#1d4ed8]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {option.text}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                disabled={currentIndex === 0}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Previous
              </button>

              {currentIndex < quiz.questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((value) => Math.min(quiz.questions.length - 1, value + 1))}
                  className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canSubmit || isSubmitting}
                  onClick={() => {
                    void handleSubmit();
                  }}
                  className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
