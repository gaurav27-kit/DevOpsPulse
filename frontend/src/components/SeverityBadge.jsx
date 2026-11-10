import React from 'react';
import { AlertOctagon, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    classes: 'bg-[#ffdad6] text-[#93000a] border-[#ffb4ab]'
  },
  high: {
    label: 'High',
    icon: AlertCircle,
    classes: 'bg-[#ffdbcd] text-[#7c2e00] border-[#ffb595]'
  },
  medium: {
    label: 'Medium',
    icon: AlertTriangle,
    classes: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]'
  },
  low: {
    label: 'Low',
    icon: Info,
    classes: 'bg-[#f2f3ff] text-[#59605f] border-[#dae2fd]'
  }
};

/**
 * Accessible badge indicating incident severity level.
 * Communicates status via both icon and text, never color alone.
 * Uses DevOpsPulse design tokens.
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
