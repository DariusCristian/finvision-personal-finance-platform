import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  fetchCurrentUser,
  loginWithPassword,
  logoutRequest,
  registerWithPassword,
  type AuthUser,
} from '../lib/api';

type LoginArgs = {
  email: string;
  password: string;
};

type RegisterArgs = {
  email: string;
  password: string;
  displayName: string;
  baseCurrency?: 'RON' | 'EUR' | 'USD';
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthLoading: boolean;
  login: (args: LoginArgs) => Promise<void>;
  register: (args: RegisterArgs) => Promise<void>;
  setCurrentUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
};

const TOKEN_STORAGE_KEY = 'finvision.accessToken';
const LEGACY_TOKEN_STORAGE_KEY = 'accessToken';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!storedToken) {
      setIsAuthLoading(false);
      return;
    }

    const hydrateAuth = async () => {
      try {
        const currentUser = await fetchCurrentUser(storedToken);
        setAccessToken(storedToken);
        setUser(currentUser.user);
      } catch {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };

    void hydrateAuth();
  }, []);

  const login = useCallback(async ({ email, password }: LoginArgs) => {
    const authPayload = await loginWithPassword({ email, password });
    window.localStorage.setItem(TOKEN_STORAGE_KEY, authPayload.accessToken);
    setAccessToken(authPayload.accessToken);
    setUser(authPayload.user);
  }, []);

  const register = useCallback(async ({
    email,
    password,
    displayName,
    baseCurrency = 'RON',
  }: RegisterArgs) => {
    await registerWithPassword({
      email,
      password,
      displayName,
      baseCurrency,
    });
  }, []);

  const clearSessionState = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await logoutRequest(accessToken);
      }
    } catch {
      // Local logout should still complete if the API call fails.
    } finally {
      clearSessionState();
    }
  }, [accessToken, clearSessionState]);

  const setCurrentUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthLoading,
      login,
      register,
      setCurrentUser,
      logout,
    }),
    [accessToken, isAuthLoading, login, logout, register, setCurrentUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};
