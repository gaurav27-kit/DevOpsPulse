import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { EmptyState } from './EmptyState.jsx';
import { Activity } from 'lucide-react';
import { formatDateTime } from '../utils/formatDate.js';

/**
 * Line chart visualizing average response time latency over time buckets.
 *
 * Rules:
 * - Empty buckets render as GAPS (connectNulls={false})
 * - Localized time axis: HH:mm for 24h, MMM d for 7d/30d
 * - Screen-reader text summary included for accessibility
 * - Shows friendly EmptyState if all buckets are null/empty
 */
export function ResponseTimeChart({
  series = [],
  range = '24h',
  height = 260
}) {
  // Determine if there is at least one non-null measurement
  const { hasData, minMs, maxMs, avgMs, chartData } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    const data = series.map((pt) => {
      const val = pt.avgResponseTimeMs;
      if (val !== null && val !== undefined) {
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
        count++;
      }
      return {
        timestamp: pt.bucketStart,
        responseTime: val
      };
    });

    return {
      hasData: count > 0,
      minMs: count > 0 ? min : null,
      maxMs: count > 0 ? max : null,
      avgMs: count > 0 ? Math.round(sum / count) : null,
      chartData: data
    };
  }, [series]);

  if (!hasData) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Response Time Latency</h3>
        <EmptyState
          icon={Activity}
          title="No health-check data for this range yet"
          description="Latency charts will display once monitoring checks are recorded."
        />
      </div>
    );
  }

  // Format tick labels based on range (in user's local timezone)
  const formatTick = (isoString) => {
    try {
      const date = new Date(isoString);
      if (range === '24h') {
        return new Intl.DateTimeFormat(undefined, {
          hour: 'numeric',
          minute: '2-digit'
        }).format(date);
      }
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch {
      return '';
    }
  };

  const srSummary = `Average response time ranged from ${minMs} ms to ${maxMs} ms with an average of ${avgMs} ms over the ${range} period.`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Response Time Latency</h3>
          <p className="text-xs text-slate-500">
            Average response time of successful checks (gaps indicate unmonitored periods or outages)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>Min: <strong className="text-slate-800">{minMs} ms</strong></span>
          <span>Avg: <strong className="text-slate-800">{avgMs} ms</strong></span>
          <span>Max: <strong className="text-slate-800">{maxMs} ms</strong></span>
        </div>
      </div>

      {/* Visually hidden screen reader summary */}
      <p className="sr-only">{srSummary}</p>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTick}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              minTickGap={35}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `${val} ms`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              labelFormatter={(label) => formatDateTime(label)}
              formatter={(value) => [
                value !== null ? `${value} ms` : 'No data',
                'Avg Latency'
              ]}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Line
              type="monotone"
              dataKey="responseTime"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={false} // Crucial: renders nulls as visible gaps
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
