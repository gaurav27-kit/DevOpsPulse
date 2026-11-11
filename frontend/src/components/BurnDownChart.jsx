import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { TrendingDown } from 'lucide-react';
import { EmptyState } from './EmptyState.jsx';

/**
 * Deterministically formats ISO date strings as UTC "MMM D" without client timezone shifting.
 */
export function formatUtcDateLabel(dateStr) {
  if (!dateStr) return '';
  const iso = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString();
  const datePart = iso.slice(0, 10);
  const [year, monthStr, dayStr] = datePart.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
    return `${months[monthIdx]} ${day}`;
  }
  return datePart;
}

/**
 * BurnDownChart component visualizing cumulative error budget consumption over rolling window days.
 */
export function BurnDownChart({
  series = [],
  windowDays = 30,
  height = 260,
  className = ''
}) {
  const { hasData, chartData, maxConsumed, endConsumed } = useMemo(() => {
    if (!Array.isArray(series) || series.length === 0) {
      return { hasData: false, chartData: [], maxConsumed: 0, endConsumed: 0 };
    }

    let max = 0;
    let validCount = 0;

    const data = series.map((item) => {
      const consumed = item.cumulativeBudgetConsumedPct ?? 0;
      if (item.total > 0 || item.cumulativeBudgetConsumedPct !== null) {
        validCount++;
      }
      if (consumed > max) max = consumed;

      return {
        day: item.day,
        utcLabel: formatUtcDateLabel(item.day),
        consumed: Number(consumed.toFixed(2)),
        totalChecks: item.total,
        badChecks: item.bad
      };
    });

    const endVal = data.length > 0 ? data[data.length - 1].consumed : 0;

    return {
      hasData: validCount > 0,
      chartData: data,
      maxConsumed: max,
      endConsumed: endVal
    };
  }, [series]);

  if (!hasData) {
    return (
      <div className={`p-6 bg-white rounded-xl border border-slate-200 shadow-sm ${className}`} data-testid="burndown-chart-empty">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Error Budget Burn Down</h3>
        <EmptyState
          icon={TrendingDown}
          title="No daily budget telemetry yet"
          description={`Daily consumption will plot here as checks are recorded across the ${windowDays}-day window.`}
        />
      </div>
    );
  }

  const srSummary = `Error budget consumption started at ${chartData[0]?.consumed ?? 0}%, peaked at ${maxConsumed.toFixed(1)}%, and currently stands at ${endConsumed.toFixed(1)}% across ${chartData.length} daily checkpoints in the rolling window. A 100% reference line marks full budget exhaustion.`;

  return (
    <div className={`p-6 bg-white rounded-xl border border-slate-200 shadow-sm ${className}`} data-testid="burndown-chart">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Error Budget Burn-Down</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cumulative budget consumed over the rolling {windowDays}-day window (100% threshold marks budget exhaustion)
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" aria-hidden="true" />
            Budget Consumed
          </span>
          <span className="flex items-center gap-1.5 font-medium text-rose-600">
            <span className="w-2.5 h-0.5 bg-rose-500 inline-block border-b border-rose-500 border-dashed" aria-hidden="true" />
            100% Threshold
          </span>
        </div>
      </div>

      {/* Screen reader accessible summary */}
      <p className="sr-only" data-testid="burndown-chart-sr-summary">{srSummary}</p>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 15, right: 20, left: -10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="utcLabel"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              minTickGap={25}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, (dataMax) => Math.max(105, Math.ceil(dataMax * 1.1))]}
            />
            <Tooltip
              formatter={(value, name) => [`${value}%`, 'Budget Consumed']}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload;
                if (!item) return label;
                return `${label} (Total: ${item.totalChecks}, Failed: ${item.badChecks})`;
              }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <ReferenceLine
              y={100}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: '100% Depleted',
                fill: '#e11d48',
                fontSize: 10,
                position: 'top'
              }}
            />
            <Line
              type="monotone"
              dataKey="consumed"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={{ r: 2, fill: '#4f46e5' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
