import { useEffect, useState } from 'react';

type SetBudgetModalProps = {
  isOpen: boolean;
  currentValue: number | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
};

const inputClassName =
  'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100';

export function SetBudgetModal({
  isOpen,
  currentValue,
  isSubmitting,
  onClose,
  onSubmit,
}: SetBudgetModalProps) {
  const [amount, setAmount] = useState(currentValue ? String(currentValue) : '');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAmount(currentValue ? String(currentValue) : '');
    setFormError(null);
  }, [currentValue, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async () => {
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Enter a valid monthly budget amount.');
      return;
    }

    setFormError(null);

    try {
      await onSubmit(parsedAmount);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to update your budget.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-slate-900">Set Monthly Budget</h2>
            <p className="mt-1 text-sm text-slate-500">Update the goal used for remaining budget and spend tracking.</p>
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
          Budget amount
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="3500"
            className={inputClassName}
          />
        </label>

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
            {isSubmitting ? 'Saving...' : 'Save Budget'}
          </button>
        </div>
      </div>
    </div>
  );
}
