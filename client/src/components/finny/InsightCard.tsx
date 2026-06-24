import { useNavigate } from 'react-router-dom';

import type { FinnyInsightCard } from '../../lib/api';

const toSafeArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function Icon({ type }: { type: string }) {
  if (type === 'budget') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
        <path d="M4.5 7.5h15" />
        <path d="M4.5 12h15" />
        <path d="M4.5 16.5h9" />
      </svg>
    );
  }

  if (type === 'invest') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
        <path d="M4 16.5 9 11.5l3.5 3.5L20 7" />
        <path d="M14 7h6v6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
      <rect x="5" y="6" width="14" height="12" rx="3" />
      <path d="M9 10h6" />
      <path d="M9 14h4" />
    </svg>
  );
}

export function InsightCard({ card }: { card: FinnyInsightCard | null | undefined }) {
  const navigate = useNavigate();

  if (!card || typeof card !== 'object') {
    return null;
  }

  const title = typeof card.title === 'string' ? card.title : '';
  const subtitle = typeof card.subtitle === 'string' ? card.subtitle : '';
  const icon = typeof card.icon === 'string' ? card.icon : 'subscription';
  const blocks = toSafeArray<Record<string, unknown>>(card.blocks).filter(
    (block): block is Record<string, unknown> => block != null && typeof block === 'object',
  );
  const actions = toSafeArray<Record<string, unknown>>(card.actions).filter(
    (action): action is Record<string, unknown> => action != null && typeof action === 'object',
  );

  const noticedBlock = blocks[0] ?? null;
  const mattersBlock = blocks[1] ?? null;
  const actionBlock = blocks[2] ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563eb]/15 text-[#1d4ed8]">
          <Icon type={icon} />
        </div>
        <div>
          {title ? <h3 className="text-xl font-semibold text-slate-900">{title}</h3> : null}
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[noticedBlock, mattersBlock].map((block, index) => {
          if (!block) {
            return null;
          }

          const heading = typeof block['heading'] === 'string' ? block['heading'] : '';
          const text = typeof block['text'] === 'string' ? block['text'] : '';

          if (!heading && !text) {
            return null;
          }

          return (
            <section key={`${heading || 'block'}-${index}`} className="rounded-xl bg-slate-100/90 p-4">
              {heading ? <p className="text-xs font-semibold tracking-[0.08em] text-[#1d4ed8]">{heading}</p> : null}
              {text ? <p className="mt-2 text-sm leading-relaxed text-slate-800">{text}</p> : null}
            </section>
          );
        })}
      </div>

      {actionBlock ? (
        <section className="mt-3 rounded-xl bg-slate-100/90 p-4">
          {typeof actionBlock['heading'] === 'string' ? (
            <p className="text-xs font-semibold tracking-[0.08em] text-[#1d4ed8]">{actionBlock['heading']}</p>
          ) : null}
          {typeof actionBlock['text'] === 'string' ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-800">{actionBlock['text']}</p>
          ) : null}
        </section>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {actions.map((action, index) => {
            const label = typeof action['label'] === 'string' ? action['label'] : '';
            const href = typeof action['href'] === 'string' ? action['href'] : '';
            const variant =
              action['variant'] === 'primary' ||
              action['variant'] === 'secondary' ||
              action['variant'] === 'link'
                ? action['variant']
                : index === 0
                  ? 'primary'
                  : 'secondary';

            if (!label || !href) {
              return null;
            }

            const className =
              variant === 'primary'
                ? 'rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]'
                : variant === 'link'
                  ? 'px-1 text-sm font-semibold text-[#2563eb] transition hover:text-[#1d4ed8]'
                  : 'rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300';

            return (
              <button
                key={`${label}-${index}`}
                type="button"
                onClick={() => {
                  if (href.startsWith('/')) {
                    navigate(href);
                    return;
                  }

                  window.open(href, '_blank', 'noopener,noreferrer');
                }}
                className={className}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
