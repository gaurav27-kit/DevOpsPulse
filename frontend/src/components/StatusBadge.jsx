import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

/**
 * Visual badge representing application or incident status.
 * Combines explicit text and icons to ensure status is never communicated by color alone.
 */
export function StatusBadge({ status = 'unknown', className = '' }) {
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
      label: 'Downtime',
      icon: XCircle,
      style: 'bg-rose-50 text-rose-700 border-rose-200'
    },
    unknown: {
      label: 'Pending',
      icon: HelpCircle,
      style: 'bg-slate-100 text-slate-700 border-slate-200'
    }
  };

  const current = configs[status.toLowerCase()] || configs.unknown;
  const Icon = current.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${current.style} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{current.label}</span>
    </span>
  );
}

