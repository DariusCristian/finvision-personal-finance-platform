import { useEffect, useState } from 'react';

type ManageInvestingWalletModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  currentValue: {
    monthlyGoal: number;
    autoFundEnabled: boolean;
    autoFundAmount: number;
    autoFundDayOfMonth: number;
  };
  onClose: () => void;
  onSubmit: (payload: {
    monthlyGoal: number;
    autoFundEnabled: boolean;
    autoFundAmount: number;
    autoFundDayOfMonth: number;
  }) => Promise<void>;
};

const inputClassName =
  'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100';

export function ManageInvestingWalletModal({
  isOpen,
  isSubmitting,
  currentValue,
  onClose,
  onSubmit,
}: ManageInvestingWalletModalProps) {
  const [monthlyGoal, setMonthlyGoal] = useState(String(currentValue.monthlyGoal ?? 0));
  const [autoFundEnabled, setAutoFundEnabled] = useState(Boolean(currentValue.autoFundEnabled));
  const [autoFundAmount, setAutoFundAmount] = useState(String(currentValue.autoFundAmount ?? 0));
  const [autoFundDayOfMonth, setAutoFundDayOfMonth] = useState(String(currentValue.autoFundDayOfMonth ?? 1));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setMonthlyGoal(String(currentValue.monthlyGoal ?? 0));
    setAutoFundEnabled(Boolean(currentValue.autoFundEnabled));
    setAutoFundAmount(String(currentValue.autoFundAmount ?? 0));
    setAutoFundDayOfMonth(String(currentValue.autoFundDayOfMonth ?? 1));
    setFormError(null);
  }, [currentValue, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async () => {
    const parsedMonthlyGoal = Number(monthlyGoal);
    const parsedAutoFundAmount = Number(autoFundAmount);
    const parsedAutoFundDay = Number(autoFundDayOfMonth);

    if (!Number.isFinite(parsedMonthlyGoal) || parsedMonthlyGoal < 0) {
      setFormError('Enter a valid monthly goal.');
      return;
    }

    if (!Number.isFinite(parsedAutoFundAmount) || parsedAutoFundAmount < 0) {
      setFormError('Enter a valid auto-fund amount.');
      return;
    }

    if (!Number.isInteger(parsedAutoFundDay) || parsedAutoFundDay < 1 || parsedAutoFundDay > 28) {
      setFormError('Auto-fund day must be between 1 and 28.');
      return;
    }

    setFormError(null);

    try {
      await onSubmit({
        monthlyGoal: parsedMonthlyGoal,
        autoFundEnabled,
        autoFundAmount: parsedAutoFundAmount,
        autoFundDayOfMonth: parsedAutoFundDay,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to update investing wallet settings.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-slate-900">Investing Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">Set your RON goal and optional monthly auto-fund settings.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="m6 6 12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Monthly goal (RON)
          <input
            type="number"
            min="0"
            step="0.01"
            value={monthlyGoal}
            onChange={(event) => setMonthlyGoal(event.target.value)}
            className={inputClassName}
          />
        </label>

        <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={autoFundEnabled}
            onChange={(event) => setAutoFundEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#2563eb] focus:ring-[#2563eb]"
          />
          Enable monthly auto-fund
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Auto-fund amount (RON)
            <input
              type="number"
              min="0"
              step="0.01"
              value={autoFundAmount}
              onChange={(event) => setAutoFundAmount(event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Auto-fund day
            <input
              type="number"
              min="1"
              max="28"
              step="1"
              value={autoFundDayOfMonth}
              onChange={(event) => setAutoFundDayOfMonth(event.target.value)}
              className={inputClassName}
            />
          </label>
        </div>

        {formError ? <p className="mt-4 text-sm font-medium text-rose-500">{formError}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
