import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';

type IconProps = {
  className?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

type FormValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

type FieldName = keyof FormValues;
type ValidationErrors = Partial<Record<FieldName, string>>;
type TouchedFields = Partial<Record<FieldName, boolean>>;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const getInputClassName = (error?: string) =>
  [
    'h-14 w-full rounded-2xl bg-slate-50/70 pl-12 pr-12 text-base text-slate-700 outline-none transition',
    error
      ? 'border border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100'
      : 'border border-[var(--color-input-border)] focus:border-blue-500 focus:ring-4 focus:ring-blue-100',
  ].join(' ');

const validateField = (field: FieldName, values: FormValues): string => {
  if (field === 'email') {
    return EMAIL_RE.test(normalizeEmail(values.email)) ? '' : 'Enter a valid email address.';
  }

  if (field === 'password') {
    return PWD_RE.test(values.password)
      ? ''
      : 'Use 8+ characters with uppercase, lowercase, and a number.';
  }

  return values.confirmPassword === values.password ? '' : 'Passwords do not match.';
};

const validateForm = (values: FormValues): ValidationErrors => {
  const nextErrors: ValidationErrors = {};

  (['email', 'password', 'confirmPassword'] as FieldName[]).forEach((field) => {
    const error = validateField(field, values);
    if (error) {
      nextErrors[field] = error;
    }
  });

  return nextErrors;
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

function UserIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
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

function ShieldIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="m12 3.5 6 2.4v5.8c0 4.1-2.3 7.8-6 9.3-3.7-1.5-6-5.2-6-9.3V5.9l6-2.4Z" />
      <path d="m9.3 12.1 1.8 1.8 3.7-3.7" />
    </svg>
  );
}

function CheckTrendIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="m4 14 4-4 3 3 8-8" />
      <path d="M16 5h3v3" />
    </svg>
  );
}

function CheckBadgeIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="m8.8 12 2.2 2.2 4.5-4.5" />
    </svg>
  );
}

function SocialButton({ label, children }: { label: string; children: ReactNode }) {
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

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(true);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const formValues: FormValues = {
    email,
    password,
    confirmPassword,
  };

  const formErrors = validateForm(formValues);
  const isFormValid = Object.keys(formErrors).length === 0;

  const updateFieldError = (field: FieldName, values: FormValues) => {
    setErrors((current) => ({
      ...current,
      [field]: validateField(field, values),
    }));
  };

  const handleBlur = (field: FieldName) => {
    const nextValues =
      field === 'email'
        ? {
            ...formValues,
            email: normalizeEmail(email),
          }
        : formValues;

    if (field === 'email') {
      setEmail(nextValues.email);
    }

    setTouched((current) => ({
      ...current,
      [field]: true,
    }));
    updateFieldError(field, nextValues);

    if (field === 'password' && touched.confirmPassword) {
      updateFieldError('confirmPassword', nextValues);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const normalizedValues: FormValues = {
      email: normalizeEmail(email),
      password,
      confirmPassword,
    };
    const nextErrors = validateForm(normalizedValues);

    setEmail(normalizedValues.email);
    setTouched({
      email: true,
      password: true,
      confirmPassword: true,
    });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!fullName.trim()) {
      setFormError('Display name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        email: normalizedValues.email,
        password,
        displayName: fullName.trim(),
        baseCurrency: 'RON',
      });

      setErrors({});
      console.info('Register submit', { agreeToTerms });
      navigate('/login?registered=1', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      brandIcon={<WalletIcon className="h-6 w-6" />}
      leftHeadline={
        <>
          <span className="block">Build Smart Money</span>
          <span className="block text-[var(--color-left-accent)]">Habits</span>
        </>
      }
      leftDescription="Create your FinVision account to track spending, learn core investing concepts, and build confidence with every financial step."
      leftMedia={
        <div className="relative mx-auto flex w-full max-w-[280px] items-center justify-center sm:max-w-[320px] lg:max-w-[340px]">
          <div className="absolute inset-8 rounded-[28px] bg-emerald-300/10 blur-3xl" />
          <div className="relative h-[220px] w-full rounded-[28px] border border-white/12 bg-white/6 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm sm:h-[260px] md:h-[300px]">
            <div className="flex h-full w-full flex-col justify-between rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(110,231,216,0.24),rgba(255,255,255,0.04)_42%,rgba(13,91,82,0.24)_78%)] p-5">
              <div className="space-y-3">
                <div className="h-12 rounded-2xl bg-white/10 ring-1 ring-white/8" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-20 rounded-2xl bg-white/8 ring-1 ring-white/6" />
                  <div className="h-20 rounded-2xl bg-white/8 ring-1 ring-white/6" />
                </div>
              </div>

              <div className="rounded-[22px] bg-white/8 p-4 ring-1 ring-white/8">
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-3 w-20 rounded-full bg-white/20" />
                  <div className="h-3 w-8 rounded-full bg-white/20" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-16 rounded-2xl bg-emerald-300/18" />
                  <div className="h-16 rounded-2xl bg-white/10" />
                  <div className="h-16 rounded-2xl bg-cyan-300/14" />
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-white/12" />
                <div className="mt-2 h-2 w-2/3 rounded-full bg-white/12" />
              </div>
            </div>
          </div>

          <div className="absolute -left-3 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-[0_18px_38px_rgba(2,132,199,0.18)] sm:h-[68px] sm:w-[68px]">
            <CheckTrendIcon className="h-6 w-6" />
          </div>
          <div className="absolute -right-1 top-6 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-emerald-500 shadow-[0_18px_38px_rgba(16,185,129,0.18)] sm:h-[68px] sm:w-[68px]">
            <ShieldIcon className="h-6 w-6" />
          </div>
        </div>
      }
      leftMeta={
        <>
          <ClockIcon className="h-4 w-4" />
          <span>2 min setup</span>
          <span className="text-white/45">•</span>
          <span>Beginner friendly</span>
        </>
      }
      rightTitle="Create Account"
      rightSubtitle="Set up your FinVision profile to get started."
      topRightAction={
        <button
          type="button"
          aria-label="Theme settings"
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-100"
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      }
    >
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
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
            Or sign up with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div>
                <label
                  htmlFor="full-name"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-heading)] sm:text-base"
                >
                  Full Name
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                    <UserIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="full-name"
                    type="text"
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      if (formError) {
                        setFormError(null);
                      }
                    }}
                    placeholder="Enter Your Full Name"
                    className="h-14 w-full rounded-2xl border border-[var(--color-input-border)] bg-slate-50/70 pl-12 pr-4 text-base text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

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
                      const nextEmail = event.target.value;
                      setEmail(nextEmail);
                      if (formError) {
                        setFormError(null);
                      }

                      if (touched.email) {
                        updateFieldError('email', {
                          ...formValues,
                          email: nextEmail,
                        });
                      }
                    }}
                    onBlur={() => handleBlur('email')}
                    placeholder="Enter Your Email"
                    className={getInputClassName(errors.email)}
                  />
                </div>
                {errors.email && touched.email ? (
                  <p className="mt-2 text-sm font-medium text-rose-500">{errors.email}</p>
                ) : null}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-[var(--color-text-heading)] sm:text-base"
                  >
                    Password
                  </label>
                  <span className="text-sm font-medium text-slate-400">
                    Use at least 8 characters
                  </span>
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
                      const nextPassword = event.target.value;
                      const nextValues = {
                        ...formValues,
                        password: nextPassword,
                      };

                      setPassword(nextPassword);
                      if (formError) {
                        setFormError(null);
                      }

                      if (touched.password) {
                        updateFieldError('password', nextValues);
                      }

                      if (touched.confirmPassword) {
                        updateFieldError('confirmPassword', nextValues);
                      }
                    }}
                    onBlur={() => handleBlur('password')}
                    placeholder="Create a password"
                    className={getInputClassName(errors.password)}
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
                {errors.password && touched.password ? (
                  <p className="mt-2 text-sm font-medium text-rose-500">{errors.password}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-heading)] sm:text-base"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                    <LockIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => {
                      const nextConfirmPassword = event.target.value;
                      setConfirmPassword(nextConfirmPassword);
                      if (formError) {
                        setFormError(null);
                      }

                      if (touched.confirmPassword) {
                        updateFieldError('confirmPassword', {
                          ...formValues,
                          confirmPassword: nextConfirmPassword,
                        });
                      }
                    }}
                    onBlur={() => handleBlur('confirmPassword')}
                    placeholder="Repeat your password"
                    className={getInputClassName(errors.confirmPassword)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 transition hover:text-slate-700"
                  >
                    <EyeIcon open={showConfirmPassword} className="h-5 w-5" />
                  </button>
                </div>
                {errors.confirmPassword && touched.confirmPassword ? (
                  <p className="mt-2 text-sm font-medium text-rose-500">{errors.confirmPassword}</p>
                ) : null}
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-base text-[var(--color-text-muted)]">
                <span className="relative mt-0.5 flex h-5 w-5 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(event) => setAgreeToTerms(event.target.checked)}
                    className="peer h-5 w-5 appearance-none rounded-md border border-slate-300 bg-white checked:border-blue-600 checked:bg-blue-600"
                  />
                  <span className="pointer-events-none absolute text-white opacity-0 transition peer-checked:opacity-100">
                    <CheckBadgeIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    className="font-semibold text-[var(--color-link)] hover:text-[#1D4ED8]"
                  >
                    Terms of Service
                  </button>{' '}
                  and{' '}
                  <button
                    type="button"
                    className="font-semibold text-[var(--color-link)] hover:text-[#1D4ED8]"
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              {formError ? <p className="text-sm font-medium text-rose-500">{formError}</p> : null}

              <button
                type="submit"
                disabled={!isFormValid || isSubmitting || !fullName.trim()}
                className={[
                  'h-14 w-full rounded-2xl text-lg font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.24)] transition',
                  !isFormValid || isSubmitting || !fullName.trim()
                    ? 'cursor-not-allowed bg-blue-300 shadow-none'
                    : 'bg-[var(--color-button-primary)] hover:bg-[var(--color-button-primary-hover)]',
                ].join(' ')}
              >
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </button>
      </form>

      <p className="mt-8 text-center text-base text-[var(--color-text-muted)]">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-semibold text-[var(--color-link)] hover:text-[#1D4ED8]"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
