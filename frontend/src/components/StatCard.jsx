import React from 'react';

/**
 * Metric summary card displaying a prominent value, label, and optional hint or badge.
 * A null or undefined value explicitly displays "No data" (NEVER 0).
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  valueClassName = '',
  className = ''
}) {
  const displayValue = value === null || value === undefined ? 'No data' : value;
  const isNoData = displayValue === 'No data';

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-xs ${className}`}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`text-2xl font-bold tracking-tight ${
            isNoData ? 'text-slate-400 font-normal text-lg' : 'text-slate-900'
          } ${valueClassName}`}
        >
          {displayValue}
        </span>
      </div>

      {hint && (
        <div className="mt-1 text-xs text-slate-500">
          {hint}
        </div>
      )}
    </div>
  );
}
