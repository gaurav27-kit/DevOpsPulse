import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

/**
 * Enhanced StatusBadge component conveying operational state with both text and iconography.
 * Strict accessibility rule: Never relies on color alone.
 */
export function StatusBadge({ status = 'unknown', className = '' }) {
  const normalized = (status || 'unknown').toLowerCase();

  const configs = {
    up: {
      label: 'Operational',
      icon: CheckCircle2,
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    degraded: {
      label: 'Degraded',
      icon: AlertTriangle,
      style: 'bg-amber-50 text-amber-700 border-amber-200'
    },
    down: {
      label: 'Down',
      icon: XCircle,
      style: 'bg-rose-50 text-rose-700 border-rose-200'
    },
    unknown: {
      label: 'Unknown',
      icon: HelpCircle,
      style: 'bg-slate-100 text-slate-700 border-slate-200'
    }
  };

  const config = configs[normalized] || configs.unknown;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.style} ${className}`}
      aria-label={`Status: ${config.label}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
