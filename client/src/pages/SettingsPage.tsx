import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
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
  avatarUrl: string;
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
  { id: 'profile', label: 'Profile', description: 'Name, email, and avatar URL' },
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
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400';

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
  avatarUrl: user.avatarUrl ?? '',
});

const toPreferencesState = (user: AuthUser): PreferencesFormState => ({
  baseCurrency: user.baseCurrency ?? 'RON',
  locale: user.locale ?? 'en-US',
});

export function SettingsPage() {
  const { accessToken, setCurrentUser, user } = useAuth();

  const [activeSection, setActiveSection] = useState<SectionId>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    displayName: '',
    email: '',
    avatarUrl: '',
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
    const avatarUrl = profileForm.avatarUrl.trim();

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
          avatarUrl,
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

  const inputClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40';
  const selectClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-blue-500 dark:focus:ring-blue-900/40';
  const labelClass = 'text-sm font-medium text-slate-600 dark:text-slate-400';
  const sectionClass = 'scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] sm:p-7 dark:border-slate-700 dark:bg-slate-800';
  const primaryBtnClass = (disabled: boolean) =>
    [
      'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40',
      disabled
        ? 'cursor-not-allowed bg-blue-300 dark:bg-blue-900'
        : 'bg-[#2563eb] hover:bg-[#1d4ed8] dark:bg-blue-600 dark:hover:bg-blue-700',
    ].join(' ');

  return (
    <AppShell activeTab="settings">
      <div className="space-y-6">
        <header>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100">Account Settings</h1>
          <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
            Manage your profile details, preferences, and security settings.
          </p>
        </header>

        {loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400">
            {loadError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="self-start rounded-3xl border border-slate-100 bg-white p-3 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] lg:sticky lg:top-24 dark:border-slate-700 dark:bg-slate-800">
            <nav aria-label="Settings sections" className="space-y-1">
              {SECTION_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={[
                    'w-full rounded-2xl px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-400',
                    activeSection === item.id
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.description}</p>
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-6">
            <section
              id="profile"
              ref={(node) => { sectionRefs.current.profile = node; }}
              className={sectionClass}
            >
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Profile</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Update your personal details.</p>
                </div>
                <div className="inline-flex items-center gap-3 self-start rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  <span>Plan</span>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-400">
                    Free plan
                  </span>
                </div>
              </div>

              <form className="mt-6 space-y-5" onSubmit={handleProfileSubmit}>
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-700/40">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#0d5b52] to-[#2563eb] text-lg font-semibold text-white">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile photo</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Placeholder avatar for MVP.</p>
                  </div>
                  <button
                    type="button"
                    className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  >
                    Upload photo
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className={labelClass}>
                    Full Name
                    <input
                      type="text"
                      value={profileForm.displayName}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, displayName: event.target.value }));
                        setProfileNotice(null);
                      }}
                      className={inputClass}
                    />
                  </label>

                  <label className={labelClass}>
                    Email Address
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, email: event.target.value }));
                        setProfileNotice(null);
                      }}
                      className={inputClass}
                    />
                  </label>

                  <label className={`${labelClass} md:col-span-2`}>
                    Avatar URL (optional)
                    <input
                      type="url"
                      value={profileForm.avatarUrl}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, avatarUrl: event.target.value }));
                        setProfileNotice(null);
                      }}
                      placeholder="https://example.com/avatar.png"
                      className={inputClass}
                    />
                  </label>
                </div>

                {profileNotice ? (
                  <p className={['rounded-xl border px-3 py-2 text-sm font-medium', noticeClassByKind(profileNotice.kind)].join(' ')}>
                    {profileNotice.message}
                  </p>
                ) : null}

                <button type="submit" disabled={isLoading || isSavingProfile} className={primaryBtnClass(isLoading || isSavingProfile)}>
                  {isSavingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </section>

            <section
              id="preferences"
              ref={(node) => { sectionRefs.current.preferences = node; }}
              className={sectionClass}
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Preferences</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Customize defaults used across your dashboard.</p>

              <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handlePreferencesSubmit}>
                <label className={labelClass}>
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
                    className={selectClass}
                  >
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </label>

                <label className={labelClass}>
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
                    className={selectClass}
                  >
                    <option value="en-US">English (US)</option>
                    <option value="ro-RO">Romanian</option>
                  </select>
                </label>

                {prefsNotice ? (
                  <p className={['md:col-span-2 rounded-xl border px-3 py-2 text-sm font-medium', noticeClassByKind(prefsNotice.kind)].join(' ')}>
                    {prefsNotice.message}
                  </p>
                ) : null}

                <div className="md:col-span-2">
                  <button type="submit" disabled={isLoading || isSavingPreferences} className={primaryBtnClass(isLoading || isSavingPreferences)}>
                    {isSavingPreferences ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </section>

            <section
              id="security"
              ref={(node) => { sectionRefs.current.security = node; }}
              className={sectionClass}
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Security</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Change your password.</p>

              <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
                <label className={`block ${labelClass}`}>
                  Current password
                  <input
                    type="password"
                    value={securityForm.currentPassword}
                    onChange={(event) => {
                      setSecurityForm((current) => ({ ...current, currentPassword: event.target.value }));
                      setPasswordErrors((current) => ({ ...current, currentPassword: undefined }));
                      setSecurityNotice(null);
                    }}
                    className={[
                      'mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-4 dark:bg-slate-700 dark:text-slate-200',
                      passwordErrors.currentPassword
                        ? 'border border-rose-300 focus:border-rose-500 focus:ring-rose-100 dark:border-rose-700 dark:focus:ring-rose-900/40'
                        : 'border border-slate-200 focus:border-[#2563eb] focus:ring-blue-100 dark:border-slate-600 dark:focus:border-blue-500 dark:focus:ring-blue-900/40',
                    ].join(' ')}
                  />
                  {passwordErrors.currentPassword ? (
                    <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{passwordErrors.currentPassword}</p>
                  ) : null}
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className={labelClass}>
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
                        'mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-4 dark:bg-slate-700 dark:text-slate-200',
                        passwordErrors.newPassword
                          ? 'border border-rose-300 focus:border-rose-500 focus:ring-rose-100 dark:border-rose-700 dark:focus:ring-rose-900/40'
                          : 'border border-slate-200 focus:border-[#2563eb] focus:ring-blue-100 dark:border-slate-600 dark:focus:border-blue-500 dark:focus:ring-blue-900/40',
                      ].join(' ')}
                    />
                    {passwordErrors.newPassword ? (
                      <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{passwordErrors.newPassword}</p>
                    ) : null}
                  </label>

                  <label className={labelClass}>
                    Confirm new password
                    <input
                      type="password"
                      value={securityForm.confirmNewPassword}
                      onChange={(event) => {
                        setSecurityForm((current) => ({ ...current, confirmNewPassword: event.target.value }));
                        setPasswordErrors((current) => ({ ...current, confirmNewPassword: undefined }));
                        setSecurityNotice(null);
                      }}
                      className={[
                        'mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-4 dark:bg-slate-700 dark:text-slate-200',
                        passwordErrors.confirmNewPassword
                          ? 'border border-rose-300 focus:border-rose-500 focus:ring-rose-100 dark:border-rose-700 dark:focus:ring-rose-900/40'
                          : 'border border-slate-200 focus:border-[#2563eb] focus:ring-blue-100 dark:border-slate-600 dark:focus:border-blue-500 dark:focus:ring-blue-900/40',
                      ].join(' ')}
                    />
                    {passwordErrors.confirmNewPassword ? (
                      <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                        {passwordErrors.confirmNewPassword}
                      </p>
                    ) : null}
                  </label>
                </div>

                {securityNotice ? (
                  <p className={['rounded-xl border px-3 py-2 text-sm font-medium', noticeClassByKind(securityNotice.kind)].join(' ')}>
                    {securityNotice.message}
                  </p>
                ) : null}

                <button type="submit" disabled={isLoading || isSavingPassword} className={primaryBtnClass(isLoading || isSavingPassword)}>
                  {isSavingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </section>

            <section
              id="billing"
              ref={(node) => { sectionRefs.current.billing = node; }}
              className={sectionClass}
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Billing</h2>
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-700/40">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Current plan: <span className="font-semibold text-slate-900 dark:text-slate-100">Free plan</span>
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Next billing date: <span className="font-medium text-slate-900 dark:text-slate-100">—</span>
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Payment method: <span className="font-medium text-slate-900 dark:text-slate-100">—</span>
                </p>
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-400">
                  Billing will be handled via Stripe in a future update. This section will show invoices,
                  payment methods, and plan upgrades.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500"
                  >
                    Upgrade (coming soon)
                  </button>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500"
                  >
                    Manage billing (coming soon)
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
