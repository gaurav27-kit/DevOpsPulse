import React from 'react';
import { Clock, Loader2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';

const DEPLOY_STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    classes: 'bg-slate-100 text-slate-700 border-slate-200'
  },
  in_progress: {
    label: 'In Progress',
    icon: Loader2,
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
    spin: true
  },
  success: {
    label: 'Success',
    icon: CheckCircle2,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    classes: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  rolled_back: {
    label: 'Rolled Back',
    icon: RotateCcw,
    classes: 'bg-purple-50 text-purple-700 border-purple-200'
  }
};

/**
 * Accessible badge indicating deployment status.
 * Communicates status via both icon and text, never color alone.
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
