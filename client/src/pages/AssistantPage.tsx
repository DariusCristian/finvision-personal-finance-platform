import { AppShell } from '../components/AppShell';

export function AssistantPage() {
  return (
    <AppShell activeTab="home">
      <section className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563eb] dark:text-blue-400">Assistant</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">Ask Finny</h1>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          The AI assistant workspace is being prepared. You can continue with Budget, Invest, News,
          and Learning modules for now.
        </p>
      </section>
    </AppShell>
  );
}
