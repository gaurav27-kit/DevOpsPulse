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
      style: 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
    },
    degraded: {
      label: 'Degraded',
      icon: AlertTriangle,
      style: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]'
    },
    down: {
      label: 'Down',
      icon: XCircle,
      style: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]'
    },
    unknown: {
      label: 'Unknown',
      icon: HelpCircle,
      style: 'bg-[#f1f5f9] text-[#334155] border-[#e2e8f0]'
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
