import React from 'react';

/**
 * ErrorBudgetGauge component rendering a meter representing error budget consumption.
 * Adheres strictly to WAI-ARIA meter pattern and honesty display rules:
 * - Visual bar width capped at 100% even if consumption is 500%
 * - Displays exact numerical consumption and remaining percentages in text
 * - Renders explicit empty/insufficient state when values are null (never NaN or false 0%)
 */
export function ErrorBudgetGauge({
  budgetConsumedPct = null,
  budgetRemainingPct = null,
  totalChecks = 0,
  minChecks = 10,
  className = ''
}) {
  const hasData = budgetConsumedPct !== null && budgetRemainingPct !== null;

  if (!hasData) {
    return (
      <div className={`p-4 bg-slate-50 rounded-lg border border-slate-200 ${className}`} data-testid="error-budget-gauge-empty">
        <div className="flex justify-between items-center text-xs text-slate-500 font-medium mb-1.5">
          <span>Error Budget</span>
          <span>Not enough data</span>
        </div>
        <div
          role="meter"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext="Not enough data to calculate error budget"
          className="w-full h-3 bg-slate-200 rounded-full overflow-hidden relative"
        >
          <div className="h-full bg-slate-300 w-0 transition-all duration-300" />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {totalChecks} of {minChecks} checks recorded. Calculations activate after {minChecks} checks.
        </p>
      </div>
    );
  }

  const numericConsumed = Number(budgetConsumedPct);
  const numericRemaining = Number(budgetRemainingPct);

  // Visual width is clamped to [0, 100]
  const visualWidth = Math.min(100, Math.max(0, numericConsumed));

  // Determine bar color by consumption thresholds
  let barColor = 'bg-emerald-500';
  if (numericConsumed >= 100) {
    barColor = 'bg-rose-500';
  } else if (numericConsumed >= 75) {
    barColor = 'bg-amber-500';
  }

  const ariaValueText = `${numericConsumed.toFixed(1)}% consumed, ${numericRemaining.toFixed(1)}% remaining`;

  return (
    <div className={`p-4 bg-white rounded-lg border border-slate-200 shadow-sm ${className}`} data-testid="error-budget-gauge">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Error Budget Consumed
        </span>
        <div className="text-right">
          <span className={`text-base font-bold ${numericConsumed >= 100 ? 'text-rose-600' : numericConsumed >= 75 ? 'text-amber-600' : 'text-slate-800'}`}>
            {numericConsumed.toFixed(1)}%
          </span>
          <span className="text-xs text-slate-500 ml-1.5 font-medium">
            ({numericRemaining.toFixed(1)}% remaining)
          </span>
        </div>
      </div>

      <div
        role="meter"
        aria-valuenow={numericConsumed}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={ariaValueText}
        className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200"
      >
        <div
          className={`h-full ${barColor} transition-all duration-500 rounded-full`}
          style={{ width: `${visualWidth}%` }}
        />
        {/* Visual 50% threshold marker */}
        <div
          className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-300 opacity-80"
          title="50% budget consumed"
          aria-hidden="true"
        />
      </div>

      <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1 font-mono">
        <span>0%</span>
        <span>50%</span>
        <span className={numericConsumed >= 100 ? 'text-rose-500 font-bold' : ''}>100%</span>
      </div>
    </div>
  );
}
