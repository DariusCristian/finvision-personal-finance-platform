import { useEffect, useMemo, useRef } from 'react';

import {
  ArcElement,
  Chart,
  DoughnutController,
  Legend,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

type CategoryDonutChartProps = {
  slices: ChartSlice[];
  total: number;
  isLoading: boolean;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function CategoryDonutChart({ slices, total, isLoading }: CategoryDonutChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartSlices = useMemo(() => {
    if (slices.length > 0) {
      return slices;
    }

    return [{ label: 'No spend yet', value: 1, color: '#CBD5E1' }];
  }, [slices]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    chartRef.current?.destroy();

    const configuration: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: chartSlices.map((slice) => slice.label),
        datasets: [
          {
            data: chartSlices.map((slice) => slice.value),
            backgroundColor: chartSlices.map((slice) => slice.color),
            borderWidth: 0,
            hoverOffset: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${currencyFormatter.format(context.parsed)}`,
            },
          },
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, configuration);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartSlices]);

  return (
    <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] lg:col-span-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Spending by Category</h2>
        <button type="button" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      <div className="relative mx-auto mt-6 h-80 w-full max-w-[20rem]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading chart...</div>
        ) : (
          <>
            <canvas ref={canvasRef} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-base text-slate-500">Total</span>
              <span className="mt-1 text-[2rem] font-bold tracking-[-0.03em] text-slate-900">
                {currencyFormatter.format(total)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {slices.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-500">No expense categories recorded for this month.</p>
        ) : (
          slices.map((slice) => {
            const percentage = total > 0 ? Math.round((slice.value / total) * 100) : 0;

            return (
              <div key={slice.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 text-slate-500">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span>{slice.label}</span>
                </div>
                <span className="font-semibold text-slate-900">{percentage}%</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
