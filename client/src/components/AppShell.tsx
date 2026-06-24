import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

type AppShellTab = 'home' | 'budget' | 'learning' | 'news' | 'settings' | 'invest' | 'market';

type AppShellProps = {
  activeTab?: AppShellTab;
  children: ReactNode;
};

type NavItem = {
  id: AppShellTab;
  label: string;
  href?: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/home' },
  { id: 'budget', label: 'Budget', href: '/budget' },
  { id: 'invest', label: 'Invest', href: '/invest' },
  { id: 'market', label: 'Market', href: '/market' },
  { id: 'learning', label: 'Learning Center', href: '/learn' },
  { id: 'news', label: 'News', href: '/news' },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v2.1c0 .8-.3 1.6-.8 2.2l-1 1.2c-.5.7 0 1.8.9 1.8h11c1 0 1.5-1.1.9-1.8l-1-1.2a3.4 3.4 0 0 1-.8-2.2V9A4.5 4.5 0 0 0 12 4.5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

const getInitials = (displayName?: string) => {
  if (!displayName) {
    return 'FV';
  }

  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export function AppShell({ activeTab, children }: AppShellProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const initials = getInitials(user?.displayName);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/home"
            className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Go to Home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563eb] text-xl font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
              {logoLoadFailed ? (
                <span aria-hidden="true">F</span>
              ) : (
                <img
                  src="/finvision-logo.png"
                  alt="FinVision"
                  className="h-10 w-10 rounded-xl object-cover"
                  onError={() => setLogoLoadFailed(true)}
                />
              )}
            </div>
            <span className="text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">FinVision</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = item.id === activeTab;
              const className = [
                'text-base font-medium transition-colors',
                isActive ? 'text-[#2563eb]' : 'text-slate-500 hover:text-[#2563eb] dark:text-slate-400',
              ].join(' ');

              if (item.href) {
                return (
                  <Link key={item.id} to={item.href} className={className}>
                    {item.label}
                  </Link>
                );
              }

              return (
                <button key={item.id} type="button" className={className}>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              type="button"
              className="relative rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Notifications"
            >
              <BellIcon />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-red-500 dark:border-slate-900" />
            </button>
            <Link
              to="/settings"
              className="flex items-center gap-3 rounded-xl border-l border-slate-200 pl-4 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-700 dark:hover:bg-slate-800"
              aria-label="Open account settings"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.displayName ?? 'FinVision User'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Free plan</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#0d5b52] to-[#2563eb] text-sm font-semibold text-white shadow-sm dark:border-slate-700">
                {initials}
              </div>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
