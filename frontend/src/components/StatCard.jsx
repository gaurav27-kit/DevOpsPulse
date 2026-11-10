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
    <div className={`rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between text-[#5a4136]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#5a4136]">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-[#59605f]" aria-hidden="true" />}
      </div>

      <div className="my-2 flex items-baseline gap-2">
        <span
          className={`text-2xl lg:text-3xl font-semibold tracking-tight ${
            isNoData ? 'text-[#59605f] font-normal text-lg' : 'text-[#131b2e]'
          } ${valueClassName}`}
        >
          {displayValue}
        </span>
      </div>

      {hint && (
        <div className="mt-auto pt-1 text-xs text-[#59605f]">
          {hint}
        </div>
      )}
    </div>
  );
}

