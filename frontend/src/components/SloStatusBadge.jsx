import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

/**
 * SloStatusBadge component displaying SLO health state with text and iconography.
 * Colors chosen to strictly exceed WCAG AA contrast ratio (> 4.5:1 on background).
 */
export function SloStatusBadge({ status = 'insufficient_data', className = '' }) {
  const normalized = (status || 'insufficient_data').toLowerCase();

  const configs = {
    healthy: {
      label: 'Healthy',
      icon: CheckCircle2,
      style: 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
    },
    at_risk: {
      label: 'At risk',
      icon: AlertTriangle,
      style: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]'
    },
    breached: {
      label: 'Breached',
      icon: XCircle,
      style: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]'
    },
    insufficient_data: {
      label: 'Not enough data',
      icon: HelpCircle,
      style: 'bg-[#f1f5f9] text-[#334155] border-[#e2e8f0]'
    }
  };

  const config = configs[normalized] || configs.insufficient_data;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.style} ${className}`}
      aria-label={`SLO Status: ${config.label}`}
      data-testid="slo-status-badge"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
