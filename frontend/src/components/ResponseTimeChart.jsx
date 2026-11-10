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
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[#131b2e] mb-2">Response Time Latency</h3>
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
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-[#131b2e]">Response Time Latency</h3>
          <p className="text-xs text-[#5a4136] mt-0.5">
            Average response time of successful checks (gaps indicate unmonitored periods or outages)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#5a4136]">
          <span>Min: <strong className="text-[#131b2e]">{minMs} ms</strong></span>
          <span>Avg: <strong className="text-[#131b2e]">{avgMs} ms</strong></span>
          <span>Max: <strong className="text-[#131b2e]">{maxMs} ms</strong></span>
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eaedff" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTick}
              stroke="#5a4136"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#dae2fd' }}
              minTickGap={35}
            />
            <YAxis
              stroke="#5a4136"
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
                border: '1px solid #dae2fd',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#131b2e',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)'
              }}
            />
            <Line
              type="monotone"
              dataKey="responseTime"
              stroke="#0061a2"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#0061a2', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={false} // Crucial: renders nulls as visible gaps
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

