import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { logout, user } = useAuth();

  return (
    <main className="min-h-screen bg-[var(--color-page-bg)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center rounded-[32px] bg-white px-8 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:px-10 lg:px-14">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Dashboard</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl">
          Welcome, {user?.displayName}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Your authenticated dashboard placeholder is ready. Next steps can layer in budget views,
          portfolio education, and the assistant modules behind this protected route.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span className="rounded-full bg-slate-100 px-4 py-2">{user?.email}</span>
          <span className="rounded-full bg-slate-100 px-4 py-2">
            Base currency: {user?.baseCurrency}
          </span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-10 inline-flex w-fit rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
