import { memo, type ReactNode } from 'react';

type KpiCardProps = {
  title: string;
  value: string;
  icon: ReactNode;
  iconBgClassName: string;
  iconClassName: string;
  badge?: ReactNode;
  subtitle?: string;
  helperText?: string;
  progressPercent?: number;
  progressColorClassName?: string;
  accentDecorationClassName: string;
};

function KpiCardComponent({
  title,
  value,
  icon,
  iconBgClassName,
  iconClassName,
  badge,
  subtitle,
  helperText,
  progressPercent,
  progressColorClassName = 'bg-orange-500',
  accentDecorationClassName,
}: KpiCardProps) {
  const normalizedProgress =
    typeof progressPercent === 'number' ? Math.max(0, Math.min(progressPercent, 100)) : null;

  return (
    <div className="group relative overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.3)]">
      <div className="pointer-events-none absolute right-4 top-4 opacity-90 transition-opacity group-hover:opacity-100">
        <div className={['h-20 w-20 rounded-[1.2rem]', accentDecorationClassName].join(' ')} />
        <div className={['-mt-11 ml-9 h-8 w-8 rounded-full', accentDecorationClassName].join(' ')} />
      </div>
      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className={["flex h-11 w-11 items-center justify-center rounded-xl", iconBgClassName].join(' ')}>
            <span className={iconClassName}>{icon}</span>
          </div>
          {badge ? <div>{badge}</div> : null}
        </div>
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
        <div className="mt-1 flex items-end gap-2">
          <p className="text-3xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">{value}</p>
          {subtitle ? <span className="pb-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</span> : null}
        </div>
        {helperText ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{helperText}</p> : null}
        {normalizedProgress !== null ? (
          <div className="mt-4 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={["h-1.5 rounded-full", progressColorClassName].join(' ')}
              style={{ width: `${normalizedProgress}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const KpiCard = memo(KpiCardComponent);
