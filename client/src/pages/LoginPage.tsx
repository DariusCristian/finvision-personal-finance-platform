import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

type IconProps = {
  className?: string;
};

function WalletIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
      <path d="M16 10.5h4.5v3H16a1.5 1.5 0 0 1 0-3Z" />
      <circle cx="16.75" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SparkIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="m5 14 4-4 3 3 7-7" />
      <path d="M15 6h4v4" />
    </svg>
  );
}

function SettingsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M12 3.5 13.9 5l2.4-.2.8 2.3 2 1.2-.8 2.2.8 2.2-2 1.2-.8 2.3-2.4-.2L12 20.5 10.1 19l-2.4.2-.8-2.3-2-1.2.8-2.2-.8-2.2 2-1.2.8-2.3 2.4.2L12 3.5Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function GoogleMark({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M21 12.23c0-.64-.06-1.25-.17-1.84H12v3.48h5.05a4.33 4.33 0 0 1-1.88 2.84v2.36h3.04c1.78-1.64 2.79-4.05 2.79-6.84Z"
        fill="#4285F4"
      />
      <path
        d="M12 21c2.52 0 4.64-.84 6.19-2.29l-3.04-2.36c-.84.56-1.92.9-3.15.9-2.42 0-4.47-1.63-5.2-3.82H3.67v2.44A9.35 9.35 0 0 0 12 21Z"
        fill="#34A853"
      />
      <path
        d="M6.8 13.43A5.6 5.6 0 0 1 6.5 12c0-.5.1-.98.3-1.43V8.13H3.67A9.03 9.03 0 0 0 2.7 12c0 1.45.35 2.83.97 4.87l3.13-2.44Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.73c1.37 0 2.6.47 3.56 1.39l2.67-2.67C16.63 3.96 14.52 3 12 3a9.35 9.35 0 0 0-8.33 5.13l3.13 2.44C7.53 8.36 9.58 6.73 12 6.73Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleMark({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M15.1 4.4c.8-1 .7-2 .7-2-.9 0-2 .6-2.6 1.4-.6.7-.8 1.8-.8 1.8s1.1.1 2-.5c.3-.2.5-.4.7-.7ZM19 16.9c-.5 1.1-.8 1.5-1.4 2.5-.8 1.2-1.9 2.7-3.2 2.7-1.2 0-1.5-.8-3.1-.8s-2 .8-3.2.8c-1.3 0-2.3-1.3-3.1-2.5-2.3-3.4-2.6-7.3-1.1-9.6 1-1.7 2.6-2.7 4.1-2.7 1.6 0 2.6.8 3.9.8 1.2 0 1.9-.8 3.8-.8 1.4 0 2.8.8 3.8 2.1-3.3 1.8-2.7 6.5-.5 7.5Z" />
    </svg>
  );
}

function MailIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m5 8 7 5 7-5" />
    </svg>
  );
}

function LockIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8.8a3.5 3.5 0 1 1 7 0v1.7" />
      <circle cx="12" cy="15" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EyeIcon({ open, className = 'h-5 w-5' }: IconProps & { open: boolean }) {
  if (open) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={className}
      >
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M3 3 21 21" />
      <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" />
      <path d="M6.8 6.8C4.3 8.4 2.8 11 2.5 12c0 0 3.5 6.5 9.5 6.5 1.8 0 3.4-.6 4.8-1.4" />
      <path d="M14.9 5.8c4.3 1 6.6 6.2 6.6 6.2-.2.5-1.2 2.3-3.2 3.9" />
    </svg>
  );
}

function ClockIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v5l3 1.8" />
    </svg>
  );
}

function PiggyIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M6.5 13.5a4.8 4.8 0 0 1 4.8-4.8h2.1a4.8 4.8 0 0 1 4.8 4.8v2.1H6.5v-2.1Z" />
      <path d="M8 15.6v2M16.3 15.6v2M18.2 11.3l1.5-1.1M7.7 9.2 6.2 8.1" />
      <circle cx="15.4" cy="11.9" r="0.5" fill="currentColor" stroke="none" />
      <path d="M11.4 10.8h2.2v1.4h-2.2z" />
    </svg>
  );
}

function ChartIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="m4 15 4-4 3 3 7-8" />
      <path d="M18 6h2v2" />
    </svg>
  );
}

function SocialButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex flex-1 items-center justify-center gap-3 rounded-2xl border border-[var(--color-input-border)] bg-white px-4 py-3 text-base font-medium text-slate-900 transition hover:bg-slate-50"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200">
        {children}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });

      console.info('Login submit', { keepSignedIn });
      navigate('/budget');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-page-bg)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] lg:min-h-[680px] lg:flex-row">
        <section className="relative flex w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--color-left-from)] to-[var(--color-left-to)] px-6 py-7 text-[var(--color-left-text)] sm:px-8 sm:py-8 md:px-10 lg:w-[45%] lg:px-12 lg:py-10">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -left-20 bottom-8 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="absolute bottom-16 left-8 h-px w-40 bg-white/10" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-white ring-1 ring-white/8 backdrop-blur">
                <WalletIcon className="h-6 w-6" />
              </div>
              <span className="text-3xl font-semibold tracking-tight">FinVision</span>
            </div>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--color-pill-border)] bg-[var(--color-pill-bg)] px-4 py-2 text-sm font-medium text-[var(--color-pill-text)] backdrop-blur">
              <SparkIcon className="h-4 w-4" />
              <span>Daily Pick</span>
            </div>

            <div className="mt-7 max-w-xl">
              <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-[4.6rem]">
                <span className="block">Compound Interest</span>
                <span className="block text-[var(--color-left-accent)]">Magic</span>
              </h1>
              <p className="mt-7 max-w-md text-lg leading-9 text-[var(--color-left-muted)]">
                Learn how your small savings can grow into a fortune over time with the power of
                compounding. Start your financial journey today.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-10 lg:mt-12">
            <div className="relative mx-auto flex w-full max-w-[320px] items-center justify-center sm:max-w-[360px] lg:max-w-[340px]">
              <div className="absolute inset-8 rounded-[28px] bg-emerald-300/10 blur-3xl" />
              <div className="relative h-[280px] w-full rounded-[28px] border border-white/12 bg-white/6 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm sm:h-[320px]">
                <div className="relative flex h-full w-full items-end justify-center overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(110,231,216,0.34),rgba(255,255,255,0.04)_42%,rgba(13,91,82,0.24)_78%)] px-6 pb-6">
                  <div className="absolute left-0 right-0 top-0 h-16 bg-gradient-to-b from-white/6 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/10 to-transparent" />
                  <div className="relative flex flex-col items-center">
                    <div className="mb-2 h-3 w-3 rounded-full bg-lime-300/80" />
                    <div className="h-16 w-[2px] rounded-full bg-lime-200/80" />
                    <div className="relative mt-[-1px] h-12 w-20">
                      <div className="absolute left-0 top-4 h-[2px] w-10 -rotate-[24deg] rounded-full bg-lime-200/90" />
                      <div className="absolute right-0 top-4 h-[2px] w-10 rotate-[24deg] rounded-full bg-lime-200/90" />
                      <div className="absolute left-1 top-7 h-[2px] w-9 -rotate-[12deg] rounded-full bg-lime-100/80" />
                      <div className="absolute right-1 top-7 h-[2px] w-9 rotate-[12deg] rounded-full bg-lime-100/80" />
                    </div>
                    <div className="mt-4 flex flex-col gap-1">
                      <div className="h-3 w-20 rounded-full bg-amber-300/85" />
                      <div className="h-3 w-20 rounded-full bg-amber-400/85" />
                      <div className="h-3 w-20 rounded-full bg-amber-500/85" />
                      <div className="h-3 w-20 rounded-full bg-amber-400/85" />
                      <div className="h-3 w-20 rounded-full bg-amber-300/85" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -left-4 top-1/2 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-[0_18px_38px_rgba(2,132,199,0.18)] sm:h-[72px] sm:w-[72px]">
                <ChartIcon className="h-7 w-7" />
              </div>
              <div className="absolute -right-2 top-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-emerald-500 shadow-[0_18px_38px_rgba(16,185,129,0.18)] sm:h-[72px] sm:w-[72px]">
                <PiggyIcon className="h-7 w-7" />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 text-sm font-medium tracking-wide text-[var(--color-left-muted)]">
              <ClockIcon className="h-4 w-4" />
              <span>5 min read</span>
              <span className="text-white/45">•</span>
              <span>Investing 101</span>
            </div>
          </div>
        </section>

        <section className="relative flex w-full flex-col bg-[var(--color-panel-right)] px-6 py-7 sm:px-8 sm:py-8 md:px-10 lg:w-[55%] lg:px-14 lg:py-10 xl:px-16">
          <div className="absolute right-6 top-6 sm:right-8 sm:top-8 lg:right-10 lg:top-8">
            <button
              type="button"
              aria-label="Theme settings"
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-100"
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center pt-10 lg:pt-8">
            <h2 className="text-4xl font-semibold tracking-[-0.03em] text-[var(--color-text-heading)] sm:text-[3.35rem]">
              Welcome!
            </h2>
            <p className="mt-3 text-lg text-[var(--color-text-muted)] sm:text-xl">
              Please enter your details to sign in.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:gap-4">
              <SocialButton label="Google">
                <GoogleMark className="h-4 w-4" />
              </SocialButton>
              <SocialButton label="Apple">
                <AppleMark className="h-4 w-4 text-slate-900" />
              </SocialButton>
            </div>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--color-divider)]" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-sm font-medium text-[var(--color-text-muted)] sm:text-base">
                  Or sign in with email
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-heading)] sm:text-base"
                >
                  Email Address
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                    <MailIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (formError) {
                        setFormError(null);
                      }
                    }}
                    placeholder="Enter Your Email"
                    className="h-14 w-full rounded-2xl border border-[var(--color-input-border)] bg-slate-50/70 pl-12 pr-4 text-base text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-[var(--color-text-heading)] sm:text-base"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-sm font-semibold text-[var(--color-link)] transition hover:text-[#1D4ED8]"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                    <LockIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (formError) {
                        setFormError(null);
                      }
                    }}
                    placeholder="Enter Your Password"
                    className="h-14 w-full rounded-2xl border border-[var(--color-input-border)] bg-slate-50/70 pl-12 pr-12 text-base text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 transition hover:text-slate-700"
                  >
                    <EyeIcon open={showPassword} className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-base text-[var(--color-text-muted)]">
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(event) => setKeepSignedIn(event.target.checked)}
                    className="peer h-5 w-5 appearance-none rounded-full border border-slate-300 bg-white checked:border-blue-600 checked:bg-blue-600"
                  />
                  <span className="pointer-events-none absolute h-2 w-2 rounded-full bg-white opacity-0 transition peer-checked:opacity-100" />
                </span>
                <span>Keep me signed in</span>
              </label>

              {formError ? <p className="text-sm font-medium text-rose-500">{formError}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password}
                className={[
                  'h-14 w-full rounded-2xl text-lg font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.24)] transition',
                  isSubmitting || !email.trim() || !password
                    ? 'cursor-not-allowed bg-blue-300 shadow-none'
                    : 'bg-[var(--color-button-primary)] hover:bg-[var(--color-button-primary-hover)]',
                ].join(' ')}
              >
                {isSubmitting ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-8 text-center text-base text-[var(--color-text-muted)]">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-[var(--color-link)] hover:text-[#1D4ED8]"
              >
                Sign up for free
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
