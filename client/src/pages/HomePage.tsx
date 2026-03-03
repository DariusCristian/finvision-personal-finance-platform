import { Link } from 'react-router-dom';

import { ApiStatus } from '../components/ApiStatus';

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">FinVision</h1>
      <p className="text-lg text-slate-600">
        Budget tracking + education + demo investing + AI assistant.
      </p>
      <ApiStatus />
      <div>
        <Link
          to="/login"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Go to Login
        </Link>
      </div>
    </main>
  );
}
