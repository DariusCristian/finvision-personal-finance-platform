import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { AppShell } from '../components/AppShell';
import { FinnyCard } from '../components/finny/FinnyCard.jsx';
import { InsightCard } from '../components/finny/InsightCard.jsx';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  sendFinnyChatMessage,
  type FinnyChatPayloadData,
} from '../lib/api';

type ChatMessage =
  | {
      id: string;
      role: 'user';
      text: string;
    }
  | {
      id: string;
      role: 'assistant';
      data: FinnyChatPayloadData;
    };

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function AssistantPage() {
  const { accessToken } = useAuth();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      data: {
        format: 'text',
        text:
          'Hi, I am Finny. I can help with budgeting concepts, app usage, and spending-pattern explanations.',
      },
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const hasMessage = useMemo(() => draft.trim().length > 0, [draft]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const message = draft.trim();

    if (!message || isSending || inFlightRef.current) {
      return;
    }

    if (!accessToken) {
      setErrorMessage('You are not authenticated. Please log in again.');
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      text: message,
    };

    setMessages((previous) => [...previous, userMessage]);
    setDraft('');
    setErrorMessage('');
    inFlightRef.current = true;
    setIsSending(true);

    try {
      const response = await sendFinnyChatMessage({ message, contextType: 'general' }, accessToken);
      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'assistant',
          data: response,
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
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSend();
  };

  return (
    <AppShell activeTab="home">
      <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563eb]">Assistant</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-900">Ask Finny</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Finny provides educational guidance only. It does not give buy or sell recommendations.
        </p>

        <div
          ref={listRef}
          className="mt-6 h-[28rem] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          {messages.map((message) => (
            <article
              key={message.id}
              className={[
                'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
                message.role === 'user'
                  ? 'ml-auto bg-[#2563eb] text-white'
                  : 'mr-auto border border-slate-200 bg-white text-slate-700',
              ].join(' ')}
            >
              {message.role === 'user' ? (
                message.text
              ) : message.data.format === 'insight_card' ? (
                <InsightCard card={message.data.card} />
              ) : message.data.format === 'card' ? (
                <FinnyCard card={message.data.card} />
              ) : (
                message.data.text
              )}
            </article>
          ))}
          {isSending ? (
            <article className="mr-auto max-w-[90%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              Finny is thinking...
            </article>
          ) : null}
        </div>

        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}

        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about budgeting, spending patterns, or FinVision features..."
            className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            maxLength={2000}
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!hasMessage || isSending}
            className="h-12 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </section>
    </AppShell>
  );
}
