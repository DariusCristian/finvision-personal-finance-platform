import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthLoading, user } = useAuth();
  const location = useLocation();

  if (isAuthLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] px-6 py-10">
        <div className="rounded-3xl bg-white px-8 py-6 text-lg font-medium text-slate-600 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          Loading your dashboard...
        </div>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
