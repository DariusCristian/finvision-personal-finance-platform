import type { ReactNode } from 'react';

type AuthShellProps = {
  brandIcon?: ReactNode;
  leftHeadline: ReactNode;
  leftDescription: string;
  leftMedia: ReactNode;
  leftMeta: ReactNode;
  rightTitle: string;
  rightSubtitle: string;
  topRightAction?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
};

function BrandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-6 w-6"
    >
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
      <path d="M16 10.5h4.5v3H16a1.5 1.5 0 0 1 0-3Z" />
      <circle cx="16.75" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AuthShell({
  brandIcon,
  leftHeadline,
  leftDescription,
  leftMedia,
  leftMeta,
  rightTitle,
  rightSubtitle,
  topRightAction,
  notice,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--color-page-bg)] p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-start lg:items-center">
        <div className="grid w-full overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:bg-slate-900 dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)] lg:max-h-[calc(100vh-3rem)] lg:grid-cols-[0.45fr_0.55fr]">
          <section className="relative flex min-h-[18rem] flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--color-left-from)] to-[var(--color-left-to)] px-5 py-5 text-[var(--color-left-text)] sm:min-h-[20rem] sm:px-6 sm:py-6 md:px-8 md:py-7 lg:min-h-0 lg:px-10 lg:py-8 xl:px-12 xl:py-10">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-20 bottom-8 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="absolute bottom-16 left-8 h-px w-40 bg-white/10" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-white ring-1 ring-white/8 md:h-11 md:w-11">
                  {brandIcon ?? <BrandMark />}
                </div>
                <span className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                  FinVision
                </span>
              </div>

              <div className="mt-6 h-10" aria-hidden="true" />

              <div className="mt-6 max-w-xl">
                <div className="text-3xl font-semibold leading-[0.98] tracking-[-0.04em] sm:text-4xl md:text-5xl lg:text-[4.2rem]">
                  {leftHeadline}
                </div>
                <p className="mt-5 max-w-md text-base leading-8 text-[var(--color-left-muted)] md:text-lg md:leading-9">
                  {leftDescription}
                </p>
              </div>
            </div>

            <div className="relative z-10 mt-8 lg:mt-10">
              {leftMedia}
              <div className="mt-5 flex items-center gap-3 text-sm font-medium tracking-wide text-[var(--color-left-muted)]">
                {leftMeta}
              </div>
            </div>
          </section>

          <section className="relative flex min-h-0 flex-col bg-[var(--color-panel-right)] lg:max-h-[calc(100vh-3rem)]">
            {topRightAction ? (
              <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6 lg:right-8 lg:top-6">
                {topRightAction}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-6 sm:px-6 sm:py-6 sm:pb-7 md:px-8 md:py-7 md:pb-8 lg:px-10 lg:py-8 lg:pb-10 xl:px-12 xl:py-10">
              <div className="mx-auto flex w-full max-w-[560px] flex-col justify-start pt-10 lg:pt-6">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-heading)] sm:text-3xl lg:text-[3.15rem]">
                  {rightTitle}
                </h2>
                <p className="mt-3 text-base text-[var(--color-text-muted)] sm:text-lg lg:text-xl">
                  {rightSubtitle}
                </p>
                {notice ? <div className="mt-4">{notice}</div> : null}
                {children}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
