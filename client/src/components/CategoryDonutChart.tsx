import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import {
  ArcElement,
  Chart,
  DoughnutController,
  Legend,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

import { formatMoney } from '../lib/formatters';

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
  currency: 'RON' | 'EUR' | 'USD';
};

type LegendSlice = ChartSlice & {
  percentage: number;
};

function CategoryDonutChartComponent({ slices, total, isLoading, currency }: CategoryDonutChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const formatCurrency = useCallback(
    (value: number) => formatMoney(value, currency),
    [currency],
  );

  const totalExpense = useMemo(() => {
    const computedTotal = slices.reduce((sum, slice) => sum + slice.value, 0);
    return computedTotal > 0 ? computedTotal : Math.max(0, total);
  }, [slices, total]);

  const legendSlices = useMemo<LegendSlice[]>(() => {
    if (slices.length === 0 || totalExpense <= 0) {
      return [];
    }

    const sortedSlices = [...slices]
      .filter((slice) => slice.value > 0)
      .sort((left, right) => right.value - left.value);

    const limitedSlices =
      sortedSlices.length <= 5
        ? sortedSlices
        : [
          ...sortedSlices.slice(0, 4),
          {
            label: 'Other',
            value: sortedSlices
              .slice(4)
              .reduce((sum, slice) => sum + slice.value, 0),
            color: '#CBD5E1',
          },
        ];

    let roundedTotal = 0;

    return limitedSlices.map((slice, index) => {
      const isLastItem = index === limitedSlices.length - 1;
      const percentage = isLastItem
        ? Math.max(0, 100 - roundedTotal)
        : Math.round((slice.value / totalExpense) * 100);

      roundedTotal += percentage;

      return {
        ...slice,
        percentage,
      };
    });
  }, [slices, totalExpense]);

  const chartSlices = useMemo(() => {
    if (legendSlices.length > 0) {
      return legendSlices;
    }

    return [{ label: 'No spend yet', value: 1, color: '#CBD5E1' }];
  }, [legendSlices]);

  const hasExpenses = totalExpense > 0;

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const isDarkMode =
      typeof document !== 'undefined'
      && document.documentElement.classList.contains('dark');
    const tooltipBackground = isDarkMode ? '#0f172a' : '#ffffff';
    const tooltipTitle = isDarkMode ? '#f1f5f9' : '#0f172a';
    const tooltipBody = isDarkMode ? '#e2e8f0' : '#334155';
    const tooltipBorder = isDarkMode ? '#334155' : '#e2e8f0';

    try {
      // Recreate with a plain config object to avoid carrying Chart.js resolver objects
      // (e.g. `_scriptable`) across updates/navigation.
      chartRef.current?.destroy();
      chartRef.current = null;

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
              backgroundColor: tooltipBackground,
              borderColor: tooltipBorder,
              borderWidth: 1,
              titleColor: tooltipTitle,
              bodyColor: tooltipBody,
              callbacks: {
                label: (context) => `${context.label}: ${formatCurrency(context.parsed as number)}`,
              },
            },
          },
        },
      };

      chartRef.current = new Chart(canvasRef.current, configuration);
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[category-donut-chart] render failed', error);
      }
    }
  }, [chartSlices, formatCurrency]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <section className="fv-card rounded-[1.5rem] p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] lg:col-span-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Spending by Category</h2>
        <button type="button" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      <div className="relative mx-auto mt-6 h-80 w-full max-w-[20rem]">
        {isLoading ? (
          <div className="space-y-4 p-4">
            <div className="mx-auto h-52 w-52 rounded-full border-[18px] border-slate-100 dark:border-slate-800" />
            <div className="mx-auto h-4 w-28 rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="mx-auto h-7 w-32 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-base text-slate-500 dark:text-slate-400">Total</span>
              <span className="mt-1 text-[2rem] font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                {formatCurrency(totalExpense)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {!hasExpenses && !isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No expenses this month.</p>
        ) : (
          legendSlices.map((slice) => (
            <div key={slice.label} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: slice.color }} />
                <span>{slice.label}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{slice.percentage}%</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export const CategoryDonutChart = memo(CategoryDonutChartComponent);
