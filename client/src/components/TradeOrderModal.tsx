import { useEffect, useMemo, useState } from 'react';

import { formatMoney, formatPrice, formatQty } from '../lib/formatters';

type TradeOrderSide = 'buy' | 'sell';

type TradeOrderModalProps = {
  isOpen: boolean;
  side: TradeOrderSide;
  onSideChange?: (nextSide: TradeOrderSide) => void;
  coinId: string;
  symbol: string;
  coinName?: string;
  currentPrice?: number | null;
  pricingCurrency?: 'USD' | 'EUR';
  cashBalance?: number;
  maxQuantity?: number | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { side: TradeOrderSide; quantity: number }) => Promise<void>;
};

export function TradeOrderModal({
  isOpen,
  side,
  onSideChange,
  coinId,
  symbol,
  coinName,
  currentPrice,
  pricingCurrency = 'USD',
  cashBalance,
  maxQuantity,
  isSubmitting = false,
  onClose,
  onSubmit,
}: TradeOrderModalProps) {
  const [quantityInput, setQuantityInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuantityInput(side === 'buy' ? '0.01' : '');
    setSubmitError(null);
  }, [isOpen, side, coinId]);

  const parsedQuantity = useMemo(() => {
    const numericValue = Number(quantityInput);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return 0;
    }

    return numericValue;
  }, [quantityInput]);

  const estimatedTotal = useMemo(() => {
    if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) {
      return null;
    }

    return parsedQuantity > 0 ? parsedQuantity * currentPrice : 0;
  }, [currentPrice, parsedQuantity]);

  const postTradeCash = useMemo(() => {
    if (typeof cashBalance !== 'number' || !Number.isFinite(cashBalance) || estimatedTotal === null) {
      return null;
    }

    return side === 'buy' ? cashBalance - estimatedTotal : cashBalance + estimatedTotal;
  }, [cashBalance, estimatedTotal, side]);

  const validationError = useMemo(() => {
    if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      return 'Live price is unavailable for this asset right now.';
    }

    if (!parsedQuantity || parsedQuantity <= 0) {
      return 'Enter a quantity greater than zero.';
    }

    if (side === 'buy' && typeof cashBalance === 'number' && estimatedTotal !== null && estimatedTotal > cashBalance) {
      return 'Insufficient buying power for this order.';
    }

    if (side === 'sell' && typeof maxQuantity === 'number' && parsedQuantity > maxQuantity) {
      return `You can sell up to ${formatQty(maxQuantity, symbol)} ${symbol}.`;
    }

    return null;
  }, [cashBalance, currentPrice, estimatedTotal, maxQuantity, parsedQuantity, side, symbol]);

  const isConfirmDisabled = isSubmitting || Boolean(validationError);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isConfirmDisabled || !parsedQuantity) {
      setSubmitError(validationError ?? 'Please correct the order details.');
      return;
    }

    setSubmitError(null);

    try {
      await onSubmit({
        side,
        quantity: parsedQuantity,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to execute order right now.';
      setSubmitError(message);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Trade {symbol}</h3>
            <p className="mt-1 text-sm text-slate-500">{coinName || coinId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close order modal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
            {(['buy', 'sell'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onSideChange?.(option)}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold capitalize transition',
                  side === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium text-slate-600">
            Quantity
            <input
              type="number"
              min="0"
              step="0.000001"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Current price</span>
              <span className="font-medium text-slate-900">{formatPrice(currentPrice, pricingCurrency)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Est. total</span>
              <span className="font-medium text-slate-900">{formatMoney(estimatedTotal, pricingCurrency)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Available cash</span>
              <span className="font-medium text-slate-900">{formatMoney(cashBalance, pricingCurrency)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Post-trade cash</span>
              <span className="font-semibold text-slate-900">{formatMoney(postTradeCash, pricingCurrency)}</span>
            </div>
            {side === 'sell' ? (
              <div className="flex items-center justify-between text-slate-600">
                <span>Available quantity</span>
                <span className="font-medium text-slate-900">
                  {formatQty(maxQuantity, symbol)} {symbol}
                </span>
              </div>
            ) : null}
          </div>

          {validationError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {validationError}
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {submitError}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isConfirmDisabled}
              className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Executing...' : side === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
