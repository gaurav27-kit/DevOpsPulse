import React from 'react';
import { AlertOctagon, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    classes: 'bg-rose-100 text-rose-800 border-rose-200'
  },
  high: {
    label: 'High',
    icon: AlertCircle,
    classes: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  medium: {
    label: 'Medium',
    icon: AlertTriangle,
    classes: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  low: {
    label: 'Low',
    icon: Info,
    classes: 'bg-slate-100 text-slate-700 border-slate-200'
  }
};

/**
 * Accessible badge indicating incident severity level.
 * Communicates status via both icon and text, never color alone.
 */
export function SeverityBadge({ severity, className = '' }) {
  const config = SEVERITY_CONFIG[severity?.toLowerCase()] || SEVERITY_CONFIG.low;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${config.classes} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
