import React from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';

/**
 * Dismissible alert notification banner for feedback after create/update/delete operations.
 * Styled with DevOpsPulse design tokens.
 */
export function AlertBanner({ message, type = 'success', onDismiss, className = '' }) {
  if (!message) return null;

  const styles = {
    success: {
      container: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]',
      icon: CheckCircle2,
      iconColor: 'text-[#10b981]'
    },
    info: {
      container: 'bg-[#f2f3ff] border-[#dae2fd] text-[#0061a2]',
      icon: Info,
      iconColor: 'text-[#0061a2]'
    },
    error: {
      container: 'bg-[#ffdad6] border-[#ffb4ab] text-[#93000a]',
      icon: AlertCircle,
      iconColor: 'text-[#ba1a1a]'
    }
  };

  const current = styles[type] || styles.success;
  const Icon = current.icon;

  return (
    <div
      role="status"
      className={`rounded-xl border p-4 flex items-center justify-between gap-3 shadow-2xs ${current.container} ${className}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 shrink-0 ${current.iconColor}`} aria-hidden="true" />
        <span className="text-sm font-medium">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-[#59605f] hover:text-[#131b2e] p-1 rounded-md focus:outline-hidden"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
