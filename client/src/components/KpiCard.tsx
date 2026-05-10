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
}: KpiCardProps) {
  const normalizedProgress =
    typeof progressPercent === 'number' ? Math.max(0, Math.min(progressPercent, 100)) : null;

  return (
    <div className="fv-card rounded-[1.5rem] p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={["flex h-11 w-11 items-center justify-center rounded-xl", iconBgClassName].join(' ')}>
          <span className={iconClassName}>{icon}</span>
        </div>
        <div className="min-h-6">{badge ?? null}</div>
      </div>
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
      <div className="mt-1 flex items-end gap-2">
        <p className="text-3xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">{value}</p>
        {subtitle ? <span className="pb-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</span> : null}
      </div>
      {helperText ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{helperText}</p> : null}
      {normalizedProgress !== null ? (
        <div className="mt-4 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={["h-1.5 rounded-full", progressColorClassName].join(' ')}
            style={{ width: `${normalizedProgress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export const KpiCard = memo(KpiCardComponent);
