import React from 'react';
import { AlertCircle, Search, CheckCircle2 } from 'lucide-react';

const STATUS_CONFIG = {
  open: {
    label: 'Open',
    icon: AlertCircle,
    classes: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  investigating: {
    label: 'Investigating',
    icon: Search,
    classes: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle2,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
};

/**
 * Accessible badge indicating incident lifecycle status.
 * Communicates status via both icon and text, never color alone.
 */
export function IncidentStatusBadge({ status, className = '' }) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG.open;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border ${config.classes} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
