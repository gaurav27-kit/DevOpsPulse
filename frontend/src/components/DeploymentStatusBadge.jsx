import React from 'react';
import { Clock, Loader2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';

const DEPLOY_STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    classes: 'bg-[#f2f3ff] text-[#59605f] border-[#dae2fd]'
  },
  in_progress: {
    label: 'In Progress',
    icon: Loader2,
    classes: 'bg-[#d1e4ff] text-[#00497c] border-[#9dcaff]',
    spin: true
  },
  success: {
    label: 'Success',
    icon: CheckCircle2,
    classes: 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    classes: 'bg-[#ffdad6] text-[#93000a] border-[#ffb4ab]'
  },
  rolled_back: {
    label: 'Rolled Back',
    icon: RotateCcw,
    classes: 'bg-[#f5f3ff] text-[#5b21b6] border-[#ddd6fe]'
  }
};

/**
 * Accessible badge indicating deployment status.
 * Communicates status via both icon and text, never color alone.
 * Uses DevOpsPulse design tokens.
 */
export function DeploymentStatusBadge({ status, className = '' }) {
  const config = DEPLOY_STATUS_CONFIG[status?.toLowerCase()] || DEPLOY_STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border ${config.classes} ${className}`}
    >
      <Icon className={`h-3 w-3 shrink-0 ${config.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
