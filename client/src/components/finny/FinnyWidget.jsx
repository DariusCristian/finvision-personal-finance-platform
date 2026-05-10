import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { FinnyCard } from './FinnyCard.jsx';
import { InsightCard } from './InsightCard.jsx';
import { FinnyTextMessage } from './FinnyTextMessage.jsx';
import { useAuth } from '../../context/AuthContext';
import { ApiRequestError, sendFinnyChatMessage } from '../../lib/api';

const HIDDEN_PATH_PREFIXES = ['/finny', '/login', '/register'];

const QUICK_CHIPS = [
  { label: 'Track expenses', contextType: 'budget', prompt: 'Help me track and improve my monthly expenses.' },
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
];

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const matchesPathPrefix = (pathname, prefixes) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const formatMessageTime = (timestampMs) =>
  new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const detectContextTypeFromInput = (input) => {
  const value = String(input ?? '').trim().toLowerCase();

  if (!value) {
    return 'general';
  }

  const contains = (keywords) => keywords.some((keyword) => value.includes(keyword));

  if (contains(['net worth', 'wealth', 'assets', 'liabilities', 'balance sheet'])) {
    return 'general';
  }

  if (contains(['subscription', 'subscriptions', 'recurring', 'renewal', 'netflix', 'spotify'])) {
    return 'subscriptions';
  }

  if (contains(['budget', 'budgeting', 'spending', 'expense', 'expenses', 'cash flow', 'save', 'saving tips'])) {
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

const resolveQuickChipPrompt = (chip) => {
  if (typeof chip?.prompt === 'string' && chip.prompt.trim().length > 0) {
    return chip.prompt.trim();
  }

  if (chip?.label === 'Saving tips') {
    return 'Give me saving tips based on my current budget and spending.';
  }

  if (chip?.label === 'Net worth') {
    return 'Explain net worth and show how my net worth is calculated in FinVision.';
  }

  return chip?.label ?? '';
};

export function FinnyWidget() {
  const { accessToken, isAuthLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const inFlightRef = useRef(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isHiddenRoute = useMemo(
    () => matchesPathPrefix(location.pathname, HIDDEN_PATH_PREFIXES),
    [location.pathname],
  );

  const shouldRender = useMemo(() => {
    if (!user || isAuthLoading || isHiddenRoute) {
      return false;
    }

    return true;
  }, [isAuthLoading, isHiddenRoute, user]);

  const hasMessage = useMemo(() => draft.trim().length > 0, [draft]);

  useEffect(() => {
    if (!shouldRender) {
      setIsOpen(false);
    }
  }, [shouldRender]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  const sendMessage = async ({ message: rawMessage, contextType } = {}) => {
    const message = (rawMessage ?? draft).trim();

    if (!message || isSending || inFlightRef.current) {
      return;
    }

    const resolvedAccessToken =
      accessToken ??
      window.localStorage.getItem('finvision.accessToken') ??
      window.localStorage.getItem('accessToken') ??
      window.sessionStorage.getItem('finvision.accessToken') ??
      window.sessionStorage.getItem('accessToken');

    if (!resolvedAccessToken) {
      setErrorMessage('You are not authenticated. Please log in again.');
      return;
    }

    const resolvedContextType = contextType ?? detectContextTypeFromInput(message);
    const now = Date.now();

    setMessages((current) => [
      ...current,
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
      const response = await sendFinnyChatMessage(
        {
          message,
          contextType: resolvedContextType,
        },
        resolvedAccessToken,
      );

      setMessages((current) => [
        ...current,
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
      inputRef.current?.focus();
    }
  };

  const handleOpenFullPage = () => {
    const trimmedDraft = draft.trim();
    setIsOpen(false);

    if (trimmedDraft.length > 0) {
      navigate(`/finny?q=${encodeURIComponent(trimmedDraft)}`);
      return;
    }

    navigate('/finny');
  };

  if (!shouldRender) {
    return null;
  }

  const widgetUi = (
    <>
      {isOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[9998] cursor-default bg-slate-900/15 dark:bg-black/45"
          aria-label="Close Finny mini chat backdrop"
          onClick={() => {
            setIsOpen(false);
          }}
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        className="fixed bottom-6 right-6 z-[9999] pointer-events-auto inline-flex items-center rounded-full bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,99,235,0.34)] transition hover:bg-[#1d4ed8]"
      >
        Ask Finny
      </button>

      {isOpen ? (
        <section
          className="fixed bottom-24 left-1/2 z-[9999] flex h-[70vh] w-[95vw] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:left-auto sm:right-6 sm:h-[520px] sm:w-[360px] sm:translate-x-0"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Finny</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Educational guidance - not financial advice.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenFullPage}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Open full page
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                }}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close Finny chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="m6 6 12 12" />
                  <path d="m18 6-12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-slate-50/60 px-3 py-3 dark:bg-slate-800/50">
            {messages.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-500 dark:text-slate-400">
                Ask about your budget, subscriptions, or investing progress.
              </p>
            ) : (
              <div className="space-y-2.5">
                {messages.map((message) => (
                  message.role === 'user' ? (
                    <article
                      key={message.id}
                      className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-[#2563eb] px-3 py-2.5 text-sm leading-5 text-white shadow-sm"
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <p className="mt-1 text-[10px] text-white/75">{formatMessageTime(message.createdAt)}</p>
                    </article>
                  ) : (
                    <article key={message.id} className="mr-auto max-w-[92%] text-sm leading-5 text-slate-700 dark:text-slate-200">
                      {message.data?.format === 'insight_card' ? (
                        <InsightCard card={message.data.card} />
                      ) : message.data?.format === 'card' ? (
                        <FinnyCard card={message.data.card} />
                      ) : (
                        <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <FinnyTextMessage
                            text={
                              typeof message.data?.text === 'string' && message.data.text.trim().length > 0
                                ? message.data.text
                                : 'Finny could not generate a response.'
                            }
                          />
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{formatMessageTime(message.createdAt)}</p>
                    </article>
                  )
                ))}

                {isSending ? (
                  <article className="mr-auto max-w-[88%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    Finny is typing...
                  </article>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <footer className="border-t border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    if (isSending || inFlightRef.current) {
                      return;
                    }

                    const prompt = resolveQuickChipPrompt(chip);
                    setDraft(prompt);
                    void sendMessage({ message: prompt, contextType: chip.contextType });
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Message Finny..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                maxLength={2000}
                disabled={isSending}
              />

              <button
                type="button"
                onClick={() => {
                  void sendMessage();
                }}
                disabled={!hasMessage || isSending}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563eb] text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message"
              >
                {isSending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M5 12h13" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                )}
              </button>
            </div>

            {errorMessage ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{errorMessage}</p> : null}
          </footer>
        </section>
      ) : null}
    </>
  );

  if (typeof document === 'undefined') {
    return widgetUi;
  }

  return createPortal(widgetUi, document.body);
}
