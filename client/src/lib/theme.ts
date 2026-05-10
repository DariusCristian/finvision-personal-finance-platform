export type Theme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'theme';

const isBrowser = () => typeof window !== 'undefined';

const isTheme = (value: string | null | undefined): value is Theme =>
  value === 'light' || value === 'dark' || value === 'system';

const resolveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    if (!isBrowser()) {
      return 'light';
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return theme;
};

export const getInitialTheme = (): Theme => {
  if (!isBrowser()) {
    return 'system';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (isTheme(storedTheme)) {
    return storedTheme;
  }

  return 'system';
};

export const applyTheme = (theme: Theme): void => {
  if (!isBrowser()) {
    return;
  }

  const resolvedTheme = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
};

export const initTheme = (): Theme => {
  const theme = getInitialTheme();
  applyTheme(theme);
  return theme;
};
