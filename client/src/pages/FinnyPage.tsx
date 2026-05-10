import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { FinnyCard } from '../components/finny/FinnyCard.jsx';
import { InsightCard } from '../components/finny/InsightCard.jsx';
import { FinnyTextMessage } from '../components/finny/FinnyTextMessage.jsx';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  sendFinnyChatMessage,
  type FinnyChatPayloadData,
  type FinnyContextType,
} from '../lib/api';

type UserMessage = {
  id: string;
  role: 'user';
  text: string;
  createdAt: number;
};

type AssistantMessage = {
  id: string;
  role: 'assistant';
  data: FinnyChatPayloadData;
  createdAt: number;
};

type ChatMessage = UserMessage | AssistantMessage;

type QuickQuestion = {
  label: string;
  contextType: FinnyContextType;
  prompt?: string;
};

const MAX_COLLAPSED_ASSISTANT_TEXT_LENGTH = 600;

const QUICK_QUESTIONS: QuickQuestion[] = [
  { label: 'Compare BTC to ETH', contextType: 'crypto' },
  { label: 'What is an ETF?', contextType: 'general' },
  { label: 'What is a bond?', contextType: 'general' },
  { label: 'Explain compound interest', contextType: 'general' },
  {
    label: 'Saving tips',
    contextType: 'budget',
    prompt: 'Give me saving tips based on my current budget and spending.',
  },
  {
    label: 'Net worth',
    contextType: 'general',
    prompt: 'Explain net worth and show how my net worth is calculated in FinVision.',
  },
  { label: 'How can I improve my budgeting?', contextType: 'budget' },
  { label: 'Check my subscriptions', contextType: 'subscriptions' },
];

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatMessageTime = (timestampMs: number) =>
  new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const detectContextTypeFromInput = (input: string): FinnyContextType => {
  const value = input.trim().toLowerCase();

  if (!value) {
    return 'general';
  }

  const contains = (keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

  if (contains(['subscription', 'subscriptions', 'recurring', 'renewal', 'netflix', 'spotify'])) {
    return 'subscriptions';
  }

  if (contains(['budget', 'budgeting', 'spending', 'expense', 'expenses', 'cash flow', 'save'])) {
    return 'budget';
  }

  if (contains(['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'blockchain'])) {
    return 'crypto';
  }

  if (contains(['stock', 'stocks', 'etf', 'equity', 'bond', 'nasdaq', 'index'])) {
    return 'stocks';
  }

  if (contains(['app', 'feature', 'where is', 'how do i', 'navigate', 'settings'])) {
    return 'app';
  }

  return 'general';
};

const resolveQuickQuestionPrompt = (question: QuickQuestion) => {
  if (question.prompt && question.prompt.trim().length > 0) {
    return question.prompt.trim();
  }

  if (question.label === 'Saving tips') {
    return 'Give me saving tips based on my current budget and spending.';
  }

  if (question.label === 'Net worth') {
    return 'Explain net worth and show how my net worth is calculated in FinVision.';
  }

  return question.label;
};

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M9.5 12.5 16 6a3.2 3.2 0 1 1 4.5 4.5l-8.4 8.4a5 5 0 0 1-7.1-7.1l8.6-8.6" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6.5 11.5a5.5 5.5 0 1 0 11 0" />
      <path d="M12 17v3.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className="h-5 w-5">
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function FinnyPage() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedAssistantIds, setExpandedAssistantIds] = useState<Record<string, boolean>>({});

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);

  const hasMessage = useMemo(() => draft.trim().length > 0, [draft]);
  const hasStartedChat = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  useEffect(() => {
    const query = new URLSearchParams(location.search).get('q');
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';

    if (!trimmedQuery) {
      return;
    }

    setDraft((current) => (current.trim().length > 0 ? current : trimmedQuery.slice(0, 2000)));
  }, [location.search]);

  const handleSend = async (params?: {
    message?: string;
    contextType?: FinnyContextType;
  }) => {
    const message = (params?.message ?? draft).trim();

    if (!message) {
      return;
    }

    if (isSending || inFlightRef.current) {
      return;
    }

    if (!accessToken) {
      setErrorMessage('You are not authenticated. Please log in again.');
      return;
    }

    const contextType = params?.contextType ?? detectContextTypeFromInput(message);
    const now = Date.now();

    setMessages((previous) => [
      ...previous,
      {
        id: createMessageId(),
        role: 'user',
        text: message,
        createdAt: now,
      },
    ]);
    setDraft('');
    setErrorMessage('');
    inFlightRef.current = true;
    setIsSending(true);

    try {
      const response = await sendFinnyChatMessage({ message, contextType }, accessToken);
      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'assistant',
          data: response,
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      const fallbackMessage = 'Finny is unavailable right now. Please try again in a moment.';
      const apiMessage =
        error instanceof ApiRequestError && error.message.trim().length > 0
          ? error.message
          : fallbackMessage;
      setErrorMessage(apiMessage);
    } finally {
      setIsSending(false);
      inFlightRef.current = false;
      composerRef.current?.focus();
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleQuickChipClick = (chip: QuickQuestion) => {
    const prompt = resolveQuickQuestionPrompt(chip);

    setDraft(prompt);
    composerRef.current?.focus();

    if (isSending || inFlightRef.current) {
      return;
    }

    setErrorMessage('');
    void handleSend({
      message: prompt,
      contextType: chip.contextType,
    });
  };

  return (
    <AppShell activeTab="home">
      <div className="fv-page mx-auto w-full max-w-[900px]">
        <section className="rounded-3xl border border-slate-200 bg-white px-4 pb-6 pt-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-7 sm:pt-10">
          <header className="text-center transition-all duration-200">
            <h1
              className={[
                'font-semibold tracking-[-0.04em] text-slate-900 transition-all duration-200 dark:text-slate-100',
                hasStartedChat ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl',
              ].join(' ')}
            >
              Finny - Your Financial Assistant
            </h1>
            <p
              className={[
                'mx-auto mt-3 max-w-[620px] text-slate-500 transition-all duration-200 dark:text-slate-400',
                hasStartedChat ? 'text-sm sm:text-base' : 'text-base sm:text-lg',
              ].join(' ')}
            >
              Track it, learn it, improve it - one month at a time.
            </p>
          </header>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {QUICK_QUESTIONS.map((question) => (
              <button
                key={question.label}
                type="button"
                onClick={() => {
                  handleQuickChipClick(question);
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                {question.label}
              </button>
            ))}
          </div>

          {hasStartedChat ? (
            <section className="mt-6">
              <div className="h-[calc(100vh-26rem)] min-h-[320px] max-h-[560px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:p-5">
                <div className="space-y-3">
                  {messages.map((message) =>
                    message.role === 'user' ? (
                      <article key={message.id} className="flex justify-end">
                        <div className="max-w-[70%]">
                          <p className="mb-1 text-right text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            You · {formatMessageTime(message.createdAt)}
                          </p>
                          <div className="rounded-2xl rounded-br-sm bg-[#2563eb] px-4 py-3 text-sm leading-6 text-white shadow-sm">
                            <p className="whitespace-pre-wrap">{message.text}</p>
                          </div>
                        </div>
                      </article>
                    ) : (
                      <article key={message.id} className="flex justify-start">
                        <div className="max-w-[70%]">
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            Finny · {formatMessageTime(message.createdAt)}
                          </p>

                          {message.data.format === 'insight_card' ? (
                            <InsightCard card={message.data.card} />
                          ) : message.data.format === 'card' ? (
                            <FinnyCard card={message.data.card} />
                          ) : (() => {
                              const text =
                                typeof message.data.text === 'string' && message.data.text.trim().length > 0
                                  ? message.data.text
                                  : 'Finny could not generate a response.';
                              const isLong = text.length > MAX_COLLAPSED_ASSISTANT_TEXT_LENGTH;
                              const isExpanded = Boolean(expandedAssistantIds[message.id]);
                              const visibleText =
                                isLong && !isExpanded
                                  ? `${text.slice(0, MAX_COLLAPSED_ASSISTANT_TEXT_LENGTH).trimEnd()}...`
                                  : text;

                              return (
                                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                  <FinnyTextMessage text={visibleText} />
                                  {isLong ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedAssistantIds((previous) => ({
                                          ...previous,
                                          [message.id]: !isExpanded,
                                        }));
                                      }}
                                      className="mt-2 text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
                                    >
                                      {isExpanded ? 'Show less' : 'Show more'}
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })()}
                        </div>
                      </article>
                    ),
                  )}

                  {isSending ? (
                    <article className="flex justify-start">
                      <div className="max-w-[70%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        Finny is thinking...
                      </div>
                    </article>
                  ) : null}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            </section>
          ) : null}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask Finny anything about your finances..."
              className="min-h-[130px] w-full resize-none bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
              disabled={isSending}
            />

            <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                <button
                  type="button"
                  className="rounded-lg p-2 transition hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label="Attach file (coming soon)"
                >
                  <PaperclipIcon />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 transition hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label="Voice input (coming soon)"
                >
                  <MicIcon />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  void handleSend();
                }}
                disabled={!hasMessage || isSending}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message"
              >
                {isSending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <ArrowIcon />
                )}
              </button>
            </div>
          </section>

          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">Press Cmd/Ctrl + Enter to send</p>
          {errorMessage ? <p className="mt-3 text-center text-sm text-red-600 dark:text-rose-300">{errorMessage}</p> : null}
        </section>
      </div>
    </AppShell>
  );
}
