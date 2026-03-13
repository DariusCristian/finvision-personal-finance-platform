import { AppShell } from '../components/AppShell';

export function AssistantPage() {
  return (
    <AppShell activeTab="home">
      <section className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563eb]">Assistant</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-900">Ask Finny</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          The AI assistant workspace is being prepared. You can continue with Budget, Invest, News,
          and Learning modules for now.
        </p>
      </section>
    </AppShell>
  );
}
