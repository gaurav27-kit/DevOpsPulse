import React from 'react';
import { AlertCircle, Search, CheckCircle2 } from 'lucide-react';

const STATUS_CONFIG = {
  open: {
    label: 'Open',
    icon: AlertCircle,
    classes: 'bg-[#ffdad6] text-[#93000a] border-[#ffb4ab]'
  },
  investigating: {
    label: 'Investigating',
    icon: Search,
    classes: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]'
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle2,
    classes: 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
  }
};

/**
 * Accessible badge indicating incident lifecycle status.
 * Communicates status via both icon and text, never color alone.
 * Uses DevOpsPulse design tokens.
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
