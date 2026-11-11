import React from 'react';
import { Flame, AlertOctagon, AlertTriangle } from 'lucide-react';

/**
 * BurnRateCard component displaying 1h and 6h burn rates and proactive alerting banners.
 */
export function BurnRateCard({
  burnRate1h = null,
  burnRate6h = null,
  fastBurn = false,
  slowBurn = false,
  className = ''
}) {
  const formatRate = (rate) => {
    if (rate === null || rate === undefined || isNaN(rate)) {
      return '—';
    }
    return `${Number(rate).toFixed(1)}x`;
  };

  return (
    <div className={`p-4 bg-white rounded-lg border border-slate-200 shadow-sm ${className}`} data-testid="burn-rate-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Burn Rate (Multi-Window)
          </h3>
        </div>
      </div>

      {/* Proactive Burn Rate Alerts */}
      {fastBurn && (
        <div
          role="alert"
          className="mb-3 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-md flex items-start gap-2.5 text-[#991b1b]"
          data-testid="fast-burn-alert"
        >
          <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
          <div className="text-xs">
            <span className="font-bold">Fast Burn Alert: </span>
            Error budget is depleting rapidly at <span className="font-mono font-semibold">{formatRate(burnRate1h)}</span> normal rate (1h lookback). Immediate investigation recommended.
          </div>
        </div>
      )}

      {slowBurn && !fastBurn && (
        <div
          role="alert"
          className="mb-3 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-md flex items-start gap-2.5 text-[#92400e]"
          data-testid="slow-burn-alert"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
          <div className="text-xs">
            <span className="font-bold">Slow Burn Alert: </span>
            Sustained elevated error rate at <span className="font-mono font-semibold">{formatRate(burnRate6h)}</span> normal rate (6h lookback).
          </div>
        </div>
      )}

      {/* Burn Rate Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-3 bg-slate-50 rounded border border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 block">1-Hour Lookback</span>
          <span
            className={`text-lg font-bold font-mono ${fastBurn ? 'text-rose-600' : 'text-slate-800'}`}
            data-testid="burn-rate-1h"
          >
            {formatRate(burnRate1h)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Threshold: 14.4x</span>
        </div>

        <div className="p-3 bg-slate-50 rounded border border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 block">6-Hour Lookback</span>
          <span
            className={`text-lg font-bold font-mono ${slowBurn ? 'text-amber-600' : 'text-slate-800'}`}
            data-testid="burn-rate-6h"
          >
            {formatRate(burnRate6h)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Threshold: 6.0x</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Burn rate measures the consumption speed of the error budget. 1.0x expends 100% of the budget exactly across the window.
      </p>
    </div>
  );
}
