import { Link } from 'react-router-dom';

type OnboardingChecklistItem = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href?: string;
  onGo?: () => void;
  goLabel?: string;
};

type OnboardingChecklistCardProps = {
  items: OnboardingChecklistItem[];
  onDismiss: () => void;
};

function CheckIcon({ completed }: { completed: boolean }) {
  if (!completed) {
    return (
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        <span className="h-2.5 w-2.5 rounded-sm bg-slate-200 dark:bg-slate-700" />
      </span>
    );
  }

  return (
    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
        <path d="m5 13 4 4L19 7" />
      </svg>
    </span>
  );
}

export function OnboardingChecklistCard({ items, onDismiss }: OnboardingChecklistCardProps) {
  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;

  return (
    <section className="fv-card rounded-[1.5rem] p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Getting started</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Complete these steps to unlock your full FinVision workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Dismiss onboarding checklist"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-2 rounded-full bg-[#2563eb] transition-all"
          style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {completedCount}/{totalCount} completed
      </p>

      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={[
              'rounded-xl border px-4 py-3',
              item.completed
                ? 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-start gap-2.5">
                  <CheckIcon completed={item.completed} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                {item.onGo ? (
                  <button
                    type="button"
                    onClick={item.onGo}
                    className="fv-secondary-btn rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    {item.goLabel ?? 'Go'}
                  </button>
                ) : item.href ? (
                  <Link
                    to={item.href}
                    className="fv-secondary-btn inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    {item.goLabel ?? 'Go'}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
