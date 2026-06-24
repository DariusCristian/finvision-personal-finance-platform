import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  ApiRequestError,
  fetchProfile,
  updatePassword,
  updateProfile,
  type AuthUser,
} from '../lib/api';

type SectionId = 'profile' | 'preferences' | 'security' | 'billing';
type PasswordField = 'currentPassword' | 'newPassword' | 'confirmNewPassword';

type ProfileFormState = {
  displayName: string;
  email: string;
};

type PreferencesFormState = {
  baseCurrency: 'RON' | 'EUR' | 'USD';
  locale: 'en-US' | 'ro-RO';
};

type SecurityFormState = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

type Notice = {
  kind: 'success' | 'error';
  message: string;
} | null;

type PasswordErrors = Partial<Record<PasswordField, string>>;

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SECTION_ITEMS: { id: SectionId; label: string; description: string }[] = [
  { id: 'profile', label: 'Profile', description: 'Name and email' },
  { id: 'preferences', label: 'Preferences', description: 'Currency and language' },
  { id: 'security', label: 'Security', description: 'Password update' },
  { id: 'billing', label: 'Billing', description: 'Plan details' },
];

const emptySecurityForm: SecurityFormState = {
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
};

const noticeClassByKind = (kind: 'success' | 'error') =>
  kind === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';

const getInitials = (displayName: string, email: string) => {
  const source = displayName.trim() || email.trim() || 'FinVision';
  const parts = source.split(' ').filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const toProfileState = (user: AuthUser): ProfileFormState => ({
  displayName: user.displayName ?? '',
  email: user.email ?? '',
});

const toPreferencesState = (user: AuthUser): PreferencesFormState => ({
  baseCurrency: user.baseCurrency ?? 'RON',
  locale: user.locale ?? 'en-US',
});

export function SettingsPage() {
  const { accessToken, logout, setCurrentUser, user } = useAuth();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<SectionId>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    displayName: '',
    email: '',
  });
  const [prefsForm, setPrefsForm] = useState<PreferencesFormState>({
    baseCurrency: 'RON',
    locale: 'en-US',
  });
  const [securityForm, setSecurityForm] = useState<SecurityFormState>(emptySecurityForm);

  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [prefsNotice, setPrefsNotice] = useState<Notice>(null);
  const [securityNotice, setSecurityNotice] = useState<Notice>(null);
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const hasLoadedProfileForTokenRef = useRef<string | null>(null);
  const lastProfileFetchAtRef = useRef<number>(0);
  const userSnapshotRef = useRef<AuthUser | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    profile: null,
    preferences: null,
    security: null,
    billing: null,
  });

  const hydrateForms = useCallback((nextUser: AuthUser) => {
    setProfileForm(toProfileState(nextUser));
    setPrefsForm(toPreferencesState(nextUser));
  }, []);

  const hydrateAuthAndForms = useCallback(
    (nextUser: AuthUser) => {
      setCurrentUser(nextUser);
      hydrateForms(nextUser);
    },
    [hydrateForms, setCurrentUser],
  );

  useEffect(() => {
    userSnapshotRef.current = user ?? null;
  }, [user]);

  useEffect(() => {
    if (!accessToken) {
      hasLoadedProfileForTokenRef.current = null;
      setIsLoading(false);
      return;
    }

    if (hasLoadedProfileForTokenRef.current === accessToken) {
      setIsLoading(false);
      return;
    }

    hasLoadedProfileForTokenRef.current = accessToken;

    const load = async () => {
      if (import.meta.env.DEV) {
        const now = Date.now();
        if (lastProfileFetchAtRef.current > 0 && now - lastProfileFetchAtRef.current < 1000) {
          console.warn('[settings] fetchProfile called more than once within 1s');
        }
        lastProfileFetchAtRef.current = now;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const payload = await fetchProfile(accessToken);
        hydrateAuthAndForms(payload.user);
      } catch (error) {
        setLoadError(
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to load account settings right now.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [accessToken, hydrateAuthAndForms, user?.id]);

  useEffect(() => {
    const currentUser = userSnapshotRef.current;

    if (!currentUser) {
      return;
    }

    hydrateForms(currentUser);
  }, [hydrateForms, user?.id]);

  useEffect(() => {
    const sections = Object.values(sectionRefs.current).filter(
      (section): section is HTMLElement => Boolean(section),
    );

    if (sections.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleSections.length === 0) {
          return;
        }

        setActiveSection(visibleSections[0].target.id as SectionId);
      },
      {
        root: null,
        rootMargin: '-28% 0px -52% 0px',
        threshold: [0.2, 0.4, 0.7],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((sectionId: SectionId) => {
    const section = sectionRefs.current[sectionId];

    if (!section) {
      return;
    }

    setActiveSection(sectionId);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const initials = useMemo(
    () => getInitials(profileForm.displayName, profileForm.email),
    [profileForm.displayName, profileForm.email],
  );

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const displayName = profileForm.displayName.trim();
    const email = profileForm.email.trim().toLowerCase();

    if (displayName.length < 2 || displayName.length > 50) {
      setProfileNotice({
        kind: 'error',
        message: 'Display name must be between 2 and 50 characters.',
      });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      setProfileNotice({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }

    if (!accessToken) {
      setProfileNotice({ kind: 'error', message: 'You are not authenticated.' });
      return;
    }

    setIsSavingProfile(true);
    setProfileNotice(null);

    try {
      const payload = await updateProfile(
        {
          displayName,
          email,
        },
        accessToken,
      );

      hydrateAuthAndForms(payload.user);
      setProfileNotice({ kind: 'success', message: 'Profile updated.' });
    } catch (error) {
      setProfileNotice({
        kind: 'error',
        message:
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to update profile right now.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePreferencesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setPrefsNotice({ kind: 'error', message: 'You are not authenticated.' });
      return;
    }

    setIsSavingPreferences(true);
    setPrefsNotice(null);

    try {
      const payload = await updateProfile(
        {
          baseCurrency: prefsForm.baseCurrency,
          locale: prefsForm.locale,
        },
        accessToken,
      );

      hydrateAuthAndForms(payload.user);
      setPrefsNotice({ kind: 'success', message: 'Preferences updated.' });
    } catch (error) {
      setPrefsNotice({
        kind: 'error',
        message:
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to update preferences right now.',
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityNotice(null);

    const nextErrors: PasswordErrors = {};

    if (!securityForm.currentPassword.trim()) {
      nextErrors.currentPassword = 'Current password is required.';
    }

    if (!securityForm.newPassword) {
      nextErrors.newPassword = 'New password is required.';
    } else if (!PASSWORD_RE.test(securityForm.newPassword)) {
      nextErrors.newPassword = 'Use at least 8 chars with uppercase, lowercase, and a number.';
    }

    if (!securityForm.confirmNewPassword) {
      nextErrors.confirmNewPassword = 'Confirm your new password.';
    } else if (securityForm.confirmNewPassword !== securityForm.newPassword) {
      nextErrors.confirmNewPassword = 'Passwords do not match.';
    }

    setPasswordErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSecurityNotice({ kind: 'error', message: 'Please correct the password fields.' });
      return;
    }

    if (!accessToken) {
      setSecurityNotice({ kind: 'error', message: 'You are not authenticated.' });
      return;
    }

    setIsSavingPassword(true);

    try {
      await updatePassword(
        {
          currentPassword: securityForm.currentPassword,
          newPassword: securityForm.newPassword,
        },
        accessToken,
      );

      setSecurityForm(emptySecurityForm);
      setPasswordErrors({});
      setSecurityNotice({ kind: 'success', message: 'Password updated successfully.' });
    } catch (error) {
      setSecurityNotice({
        kind: 'error',
        message:
          error instanceof ApiRequestError
            ? error.message
            : 'Unable to update password right now.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);

    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      navigate('/login', { replace: true });
    }
  }, [logout, navigate]);

  return (
    <AppShell activeTab="settings">
      <div className="fv-page space-y-6">
        <header>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Account Settings</h1>
          <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
            Manage your profile details, preferences, and security settings.
          </p>
        </header>

        {loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {loadError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="self-start rounded-3xl border border-slate-100 bg-white p-3 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-24">
            <nav aria-label="Settings sections" className="space-y-1">
              {SECTION_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={[
                    'w-full rounded-2xl px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-400',
                    activeSection === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-6">
            <section
              id="profile"
              ref={(node) => {
                sectionRefs.current.profile = node;
              }}
              className="scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Profile</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Update your personal details.</p>
                </div>
                <div className="inline-flex items-center gap-3 self-start rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <span>Plan</span>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    Free plan
                  </span>
                </div>
              </div>

              <form className="mt-6 space-y-5" onSubmit={handleProfileSubmit}>
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#0d5b52] to-[#2563eb] text-lg font-semibold text-white">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile avatar</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Generated from your initials.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Full Name
                    <input
                      type="text"
                      value={profileForm.displayName}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, displayName: event.target.value }));
                        setProfileNotice(null);
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-900/40"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Email Address
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, email: event.target.value }));
                        setProfileNotice(null);
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-900/40"
                    />
                  </label>

                </div>

                {profileNotice ? (
                  <p className={[
                    'rounded-xl border px-3 py-2 text-sm font-medium',
                    noticeClassByKind(profileNotice.kind),
                  ].join(' ')}>
                    {profileNotice.message}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isLoading || isSavingProfile}
                  className={[
                    'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 focus:ring-blue-100',
                    isLoading || isSavingProfile
                      ? 'cursor-not-allowed bg-blue-300'
                      : 'bg-[#2563eb] hover:bg-[#1d4ed8]',
                  ].join(' ')}
                >
                  {isSavingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </section>

            <section
              id="preferences"
              ref={(node) => {
                sectionRefs.current.preferences = node;
              }}
              className="scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Preferences</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Customize defaults used across your dashboard.</p>

              <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handlePreferencesSubmit}>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Primary currency
                  <select
                    value={prefsForm.baseCurrency}
                    onChange={(event) => {
                      setPrefsForm((current) => ({
                        ...current,
                        baseCurrency: event.target.value as PreferencesFormState['baseCurrency'],
                      }));
                      setPrefsNotice(null);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
                  >
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Language
                  <select
                    value={prefsForm.locale}
                    onChange={(event) => {
                      setPrefsForm((current) => ({
                        ...current,
                        locale: event.target.value as PreferencesFormState['locale'],
                      }));
                      setPrefsNotice(null);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="ro-RO">Romanian</option>
                  </select>
                </label>

                <div className="md:col-span-2">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Dark mode</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Reduce eye strain in low light.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={theme === 'dark'}
                      onClick={toggleTheme}
                      className={[
                        'relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2 dark:focus:ring-offset-slate-900',
                        theme === 'dark' ? 'bg-[#2563eb]' : 'bg-slate-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                          theme === 'dark' ? 'translate-x-6' : 'translate-x-1',
                        ].join(' ')}
                      />
                    </button>
                  </div>
                </div>

                {prefsNotice ? (
                  <p className={[
                    'md:col-span-2 rounded-xl border px-3 py-2 text-sm font-medium',
                    noticeClassByKind(prefsNotice.kind),
                  ].join(' ')}>
                    {prefsNotice.message}
                  </p>
                ) : null}

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={isLoading || isSavingPreferences}
                    className={[
                      'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 focus:ring-blue-100',
                      isLoading || isSavingPreferences
                        ? 'cursor-not-allowed bg-blue-300'
                        : 'bg-[#2563eb] hover:bg-[#1d4ed8]',
                    ].join(' ')}
                  >
                    {isSavingPreferences ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </section>

            <section
              id="security"
              ref={(node) => {
                sectionRefs.current.security = node;
              }}
              className="scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Security</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Change your password.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  disabled={isLoggingOut}
                  className={[
                    'inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-slate-200',
                    isLoggingOut
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  {isLoggingOut ? 'Logging out...' : 'Log out'}
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
                <label className="block text-sm font-medium text-slate-600">
                  Current password
                  <input
                    type="password"
                    value={securityForm.currentPassword}
                    onChange={(event) => {
                      setSecurityForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }));
                      setPasswordErrors((current) => ({ ...current, currentPassword: undefined }));
                      setSecurityNotice(null);
                    }}
                    className={[
                      'mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-4',
                      passwordErrors.currentPassword
                        ? 'border border-rose-300 focus:border-rose-500 focus:ring-rose-100'
                        : 'border border-slate-200 focus:border-[#2563eb] focus:ring-blue-100',
                    ].join(' ')}
                  />
                  {passwordErrors.currentPassword ? (
                    <p className="mt-2 text-xs font-medium text-rose-600">{passwordErrors.currentPassword}</p>
                  ) : null}
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    New password
                    <input
                      type="password"
                      value={securityForm.newPassword}
                      onChange={(event) => {
                        setSecurityForm((current) => ({ ...current, newPassword: event.target.value }));
                        setPasswordErrors((current) => ({ ...current, newPassword: undefined }));
                        setSecurityNotice(null);
                      }}
                      className={[
                        'mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-4',
                        passwordErrors.newPassword
                          ? 'border border-rose-300 focus:border-rose-500 focus:ring-rose-100'
                          : 'border border-slate-200 focus:border-[#2563eb] focus:ring-blue-100',
                      ].join(' ')}
                    />
                    {passwordErrors.newPassword ? (
                      <p className="mt-2 text-xs font-medium text-rose-600">{passwordErrors.newPassword}</p>
                    ) : null}
                  </label>

                  <label className="text-sm font-medium text-slate-600">
                    Confirm new password
                    <input
                      type="password"
                      value={securityForm.confirmNewPassword}
                      onChange={(event) => {
                        setSecurityForm((current) => ({
                          ...current,
                          confirmNewPassword: event.target.value,
                        }));
                        setPasswordErrors((current) => ({ ...current, confirmNewPassword: undefined }));
                        setSecurityNotice(null);
                      }}
                      className={[
                        'mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-4',
                        passwordErrors.confirmNewPassword
                          ? 'border border-rose-300 focus:border-rose-500 focus:ring-rose-100'
                          : 'border border-slate-200 focus:border-[#2563eb] focus:ring-blue-100',
                      ].join(' ')}
                    />
                    {passwordErrors.confirmNewPassword ? (
                      <p className="mt-2 text-xs font-medium text-rose-600">
                        {passwordErrors.confirmNewPassword}
                      </p>
                    ) : null}
                  </label>
                </div>

                {securityNotice ? (
                  <p className={[
                    'rounded-xl border px-3 py-2 text-sm font-medium',
                    noticeClassByKind(securityNotice.kind),
                  ].join(' ')}>
                    {securityNotice.message}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isLoading || isSavingPassword}
                  className={[
                    'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 focus:ring-blue-100',
                    isLoading || isSavingPassword
                      ? 'cursor-not-allowed bg-blue-300'
                      : 'bg-[#2563eb] hover:bg-[#1d4ed8]',
                  ].join(' ')}
                >
                  {isSavingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </section>

            <section
              id="billing"
              ref={(node) => {
                sectionRefs.current.billing = node;
              }}
              className="scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Billing</h2>
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-600">
                  Current plan: <span className="font-semibold text-slate-900">Free plan</span>
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Next billing date: <span className="font-medium text-slate-900">—</span>
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Payment method: <span className="font-medium text-slate-900">—</span>
                </p>
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Billing will be handled via Stripe in a future update. This section will show invoices,
                  payment methods, and plan upgrades.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-400"
                  >
                    Upgrade (coming soon)
                  </button>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-400"
                  >
                    Manage billing (coming soon)
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-rose-700">Danger Zone</h3>
                    <p className="mt-1 text-sm text-rose-600">
                      End the current session on this device.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleLogout();
                    }}
                    disabled={isLoggingOut}
                    className={[
                      'inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-rose-200',
                      isLoggingOut
                        ? 'cursor-not-allowed border-rose-200 bg-rose-100 text-rose-400'
                        : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-100',
                    ].join(' ')}
                  >
                    {isLoggingOut ? 'Logging out...' : 'Log out'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
